import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import axios from "axios";
import * as matter from "gray-matter";
import * as cheerio from "cheerio";
import { Context } from "./context";

const REG_WWWIMG = new RegExp("^(http|https):.+");

/**
 * Post to wordpress from current document.
 */
export const post = async (context: Context) => {
  // start
  context.debug(`[00S] post start`);

  // current document
  context.debug(`[01S] get document`);
  const doc = getCurrentDocument();
  context.debug(`[01E] got document`);

  // document path
  context.debug(`[02S] detect document path`);
  const docPath = doc.fileName;
  const docParsedPath = path.parse(docPath);
  context.debug(`[02E] detected document path: ${docPath}`);

  // check document file extension
  context.debug(`[03S] check file extension`);
  if (docParsedPath.ext !== ".md") {
    const msg = `Not a Markdow file: ${docParsedPath.base}`;
    context.debug(`[03Z] ${msg}`);
    throw new Error(msg);
  }
  context.debug(`[03E] check file extension : ok`);

  // post data
  const postData: { [key: string]: any } = {};

  // text -> frontmatter(markdown.data) and markdown(markdown.content)
  context.debug(`[05S] parse document`);
  const markdown = matter(doc.getText());
  context.debug(`[05E] parsed document`);

  // frontmatter -> post data attributes
  context.debug(`[05S] parse frontmatter`);
  const slugKeys = context.getSlugKeys();
  for (const key in markdown.data) {
    if (slugKeys.indexOf(key) > -1) {
      // slug -> id by http request
      const slugs: string[] = markdown.data[key];
      const items = await Promise.all(
        slugs.map((slug) => getWpItem(context, key, { slug: slug }))
      );
      postData[key] = items.map((item) => item["id"]);
    } else {
      postData[key] = markdown.data[key];
    }
    context.debug(`[05I] frontmatter ${key} : ${postData[key]}`);
  }
  context.debug(`[05E] parse frontmatter`);

  // document slug
  context.debug(`[04S] detect document slug`);
  if (!postData["slug"]) {
    postData["slug"] = docParsedPath.name;
  }
  context.debug(`[04E] detected document slug : ${postData["slug"]}`);

  // markdown -> post data content
  context.debug(`[06S] convert to html`);
  const md = require('markdown-it')({
    highlight: function (str: string, lang: string) {
      return context.getCodeBlockStartTag(lang) + md.utils.escapeHtml(str) + context.getCodeBlockEndTag();
    }
  });
  postData["content"] = md.render(markdown.content);
  context.debug(`[06E] converted to html`);

  // upload attached image file, change src
  context.debug(`[07S] process attached images`);
  const ch = cheerio.load(postData["content"]);
  const imgs = ch("img");
  for (let i = 0; i < imgs.length; i++) {
    // src attr
    let srcAttr = ch(imgs[i]).attr("src");
    if (!srcAttr) {
      context.debug(`[07I] skip image tag`);
      continue;
    }

    // save src attr to use useLinkableImage
    let linkUri = srcAttr;

    // add title attribute
    if ( context.imageAddTitleAttribute() ) {
      ch(imgs[i]).attr("title", ch(imgs[i]).attr("alt"));
    }

    // Get image size information 
    const [orgImgWidth, orgImgHeight] = await getImageSize(docParsedPath.dir, srcAttr);
    const [maxImgWidth, maxImgHeight] = context.getImageMaxSize();
    const [displayImgWidth, displayImgHeight] = calculateImageSize(orgImgWidth, orgImgHeight, maxImgWidth, maxImgHeight);
    
    // replace src attr
    if (srcAttr.match(REG_WWWIMG)) {
      // www link -> as is
      // srcAttr = srcAttr
      context.debug(`[07I] www src: ${srcAttr}`);
      if ( context.imageResize() ) {
        ch(imgs[i]).attr("width", displayImgWidth.toString());
        ch(imgs[i]).attr("height", displayImgHeight.toString());        
      } else {
        if ( context.imageAddSizeAttributes() ) {
          ch(imgs[i]).attr("width", orgImgWidth.toString());
          ch(imgs[i]).attr("height", orgImgHeight.toString());
        }
      }
    } else {
      // local(relative link) -> upload and replace src attr
      // upload 
      context.debug(`[07I] local src: ${srcAttr}`);
      const attachedImgPath = path.join(docParsedPath.dir, srcAttr);
      context.debug(`[07I] local path: ${attachedImgPath}`);
      const imgSlug = context.getAttachedImageSlug(
        path.parse(attachedImgPath).name,
        postData["slug"]
      );
      context.debug(`[07I] image slug: ${imgSlug}`);
      const imgItem = await uploadImage(context, imgSlug, attachedImgPath);

      // replace src
      srcAttr = context.replaceAttachedImageUrl(imgItem["source_url"]);
      linkUri = srcAttr;

      context.debug(`[07I] final image src: ${srcAttr}`);

      // generate thumbnail image if needed.
      if ( context.imageResize() ) {
        if ( (orgImgWidth !== displayImgWidth) || (orgImgHeight !== displayImgHeight) ) {
          const size = displayImgWidth.toString() + "x" + displayImgHeight.toString();
          const thumbnail = 
            path.join(
              path.parse(attachedImgPath).dir,
              path.parse(attachedImgPath).name + "-" + size + path.parse(attachedImgPath).ext
            );
          const thumbnailSlug = context.getAttachedImageThumbnailSlug(imgSlug, displayImgWidth, displayImgHeight);  

          /* generate thumbnail */
          const sharp = require("sharp");
          try {
            let data = sharp(attachedImgPath).resize({
              width: displayImgWidth,
              height: displayImgHeight,
              fit: "fill" 
            });

            // encode JPEG or PNG according to configuration
            const ext = path.parse(attachedImgPath).ext.toLowerCase();
            if ( (ext === ".jpg") || (ext === ".jpeg") ) {
              data = data.jpeg({
                quality: context.getImageResizeJpegQuality(),
                mozjpeg: context.useMozjpeg()
              });
            }
            if ( ext === ".png" ) {
              data = data.png({
                palette: context.usePngPalette()
              });
            }
            data.toFile(thumbnail);
          }
          catch(err) {
            const msg = `Can't generate thumbnail file: ${attachedImgPath}`;
            context.debug(msg);
            throw new Error(msg);
          };

          /* upload thumbnail to wordpress */
          const imgItem = await uploadImage(context, thumbnailSlug, thumbnail);
          srcAttr = context.replaceAttachedImageUrl(imgItem["source_url"]);

          ch(imgs[i]).attr("width", displayImgWidth.toString());
          ch(imgs[i]).attr("height", displayImgHeight.toString());
        }
      } else {
        if ( context.imageAddSizeAttributes() ) {
          ch(imgs[i]).attr("width", orgImgWidth.toString());
          ch(imgs[i]).attr("height", orgImgHeight.toString());
        }
      }
    }
    const newImgTag = ch.html(ch(imgs[i]).attr("src", srcAttr));
    if (context.useLinkableImage()) {
      context.debug(`[07I] use a tag`);
      ch(imgs[i]).replaceWith(`<a href="${linkUri}">${newImgTag}</a>`);
    } else {
      context.debug(`[07I] not use a tag`);
      ch(imgs[i]).replaceWith(`${newImgTag}`);
    }
  }
  context.debug(`[07E] processed attached images`);

  // restore html
  context.debug(`[08S] update html`);
  postData["content"] = ch.html(ch("body > *"), { decodeEntities: false });
  context.debug(`[08E] updated html`);

  // featured image upload
  if (!postData["featured_media"]) {
    context.debug(`[09S] upload featured image`);
    const imgPath = findLocalFeaturedImage(context, docParsedPath);
    if (imgPath === "") {
      const defaultId = context.getDefaultFeaturedImageId();
      if (defaultId >= 0) {
        postData["featured_media"] = context.getDefaultFeaturedImageId();
        context.debug(`[09E] has no image id: ${postData["featured_media"]}`);
      } else {
        context.debug(`[09E] has no image id (not set)`);
      }
    } else {
      const imgSlug = context.getFeaturedImageSlug(postData["slug"]);
      context.debug(`[09I] upload featured image : ${imgPath} as ${imgSlug}`);
      const imgItem = await uploadImage(context, imgSlug, imgPath);
      postData["featured_media"] = imgItem["id"];
      context.debug(`[09E] uploaded image id: ${postData["featured_media"]}`);
    }
  }

  // format HTML if needed
  if ( context.getFormatHtml() ) {
    const beautify = require('js-beautify').html;
    postData["content"] = beautify(postData["content"]);

    // add blank line before <hN> and after </hN> respectively
    if ( context.getAddBlankLineToH() ) {
      let content = postData["content"];
      content = content.replace(/<h1>/g, '\n<h1>').replace(/<\/h1>/g, '</h1>\n');
      content = content.replace(/<h2>/g, '\n<h2>').replace(/<\/h2>/g, '</h2>\n');
      content = content.replace(/<h3>/g, '\n<h3>').replace(/<\/h3>/g, '</h3>\n');
      content = content.replace(/<h4>/g, '\n<h4>').replace(/<\/h4>/g, '</h4>\n');
      content = content.replace(/<h5>/g, '\n<h5>').replace(/<\/h5>/g, '</h5>\n');
      content = content.replace(/<h6>/g, '\n<h6>').replace(/<\/h6>/g, '</h6>\n');
      postData["content"] = content;
    }
    // add blank line before <table> and after </table> respectively
    if ( context.getAddBlankLineToTable() ) {
      let content = postData["content"];
      content = content.replace(/<table>/g, '\n<table>').replace(/<\/table>/g, '</table>\n');
      postData["content"] = content;
    }
    // add blank line before <pre> and after </pre> respectively
    if ( context.getAddBlankLineToPre() ) {
      let content = postData["content"];
      content = content.replace(/<pre>/g, '\n<pre>').replace(/<\/pre>/g, '</pre>\n');
      postData["content"] = content;
    }
  }

  // post
  context.debug(`[10S] post document`);
  const postItem = await getWpItem(
    context,
    "posts",
    { slug: postData["slug"], status: "publish,future,draft,pending,private" },
    false
  );
  let postUrl = context.getUrl("posts");
  if (postItem) {
    postUrl = `${postUrl}/${postItem["id"]}/`;
    context.debug(`[10I] update post id : ${postItem["id"]}`);
  } else {
    context.debug(`[10I] new post`);
  }
  const res = await axios({
    url: postUrl,
    method: `POST`,
    data: postData,
    auth: context.getAuth(),
  });
  const msg = `Finished posting to WordPress. id = ${res.data["id"]}`;
  context.debug(`[10E] ${msg}`);
  vscode.window.showInformationMessage(msg);

  // end
  context.debug(`[00E] post end`);
};

/**
 * upload image to wordpess
 */
const uploadImage = async (context: Context, slug: string, imgPath: string) => {
  // path
  const imgParsedPath = path.parse(imgPath);

  // find image from wordpress, if exists return this item
  const item = await getWpItem(context, "media", { slug: slug }, false);
  if (item) {
    return item;
  }

  // if not exists local image, error
  if (!fs.existsSync(imgPath)) {
    throw new Error(`Not found local image file : ${imgPath}`);
  }

  // create header
  const headers: { [name: string]: string } = {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "Content-Type": context.getMediaType(imgParsedPath.ext),
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "Content-Disposition": `attachment; filename=${slug}${imgParsedPath.ext}`,
  };

  // load image
  let imageBin;
  try {
    imageBin = fs.readFileSync(imgPath);
  } catch (e) {
    throw new Error(`failed to read: ${e}`);
  }

  // post (upload image)
  const res = await axios({
    url: context.getUrl("media"),
    method: `POST`,
    headers: headers,
    data: imageBin,
    auth: context.getAuth(),
  });
  return res.data; 
};

/**
 * find feature image from local path
 */
const findLocalFeaturedImage = (
  context: Context,
  docParsedPath: path.ParsedPath
) => {
  for (const ext of context.getMediaExtensions()) {
    const imgPath = path.join(docParsedPath.dir, `${docParsedPath.name}${ext}`);
    if (fs.existsSync(imgPath)) {
      return imgPath;
    }
  }
  return "";
};

/**
 * Find item by slug from http request.
 */
const getWpItem = async (
  context: Context,
  label: string,
  params: { [key: string]: string },
  isThrow = true
) => {
  const res = await axios({
    url: context.getUrl(label),
    method: `GET`,
    params: params,
    auth: context.getAuth(),
  });
  if (res.data.length === 1) {
    return res.data[0];
  } else {
    if (isThrow) {
      throw new Error(`${label}=${params["slug"]} is not found or duplicated.`);
    } else {
      return null;
    }
  }
};

const getCurrentDocument = () => {
  // editor
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new Error("Please call from markdown file.");
  }

  // return document
  return editor.document;
};

async function getImageSize(base: string, src: string) {
  const probe = require('probe-image-size');
  
  if (src.match(REG_WWWIMG)) {
    const result = await probe(src);
    return [result.width, result.height];
  }

  let data = fs.readFileSync(base + "/" + src);
  let result = probe.sync(data);
  return [result.width, result.height];
};

function calculateImageSize(imgWidth: number, imgHeight: number, maxWidth: number, maxHeight: number) : [number, number] {

  if ( (imgWidth <= maxWidth) || (maxWidth === 0) ) {
    if ( (imgHeight <= maxHeight) || (maxHeight === 0) ) {
      return [imgWidth, imgHeight];
    } else {
      return [Math.trunc(imgWidth * maxHeight / imgHeight), maxHeight];
    }
  }

  // imgWidth is greater than maxWidth
  if ( (imgHeight <= maxHeight) || (maxHeight === 0) ) {
      return [maxWidth, Math.trunc(imgHeight * maxWidth / imgWidth)];
  }

  // both imgHeight and imgWidth are greater than maxWidth and maxHeight
  const widthRatio = imgWidth / maxWidth;
  const heightRatio = imgHeight / maxHeight;
  if ( widthRatio > heightRatio ) {
    return [maxWidth, Math.trunc(imgHeight * maxWidth / imgWidth)];
  } else {
    return [Math.trunc(imgWidth * maxHeight / imgHeight), maxHeight];
  }
};