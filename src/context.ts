import * as vscode from "vscode";

export class Context {
  public static readonly appId = "wordpress-post";
  public static readonly appName = "WordPress Post";
  public readonly prefixOfSettings = Context.appId;
  private outputChannel: vscode.OutputChannel | undefined = undefined;

  constructor(public vscodeContext: vscode.ExtensionContext) {
    this.outputChannel = this.getConf("debug")
      ? vscode.window.createOutputChannel(Context.appName)
      : undefined;
  }

  /**
   * Auth of REST API
   */
  getAuth(): any {
    return {
      username: this.getConf("authUser"),
      password: this.getConf("authPassword"),
    };
  }

  /**
   * Site URL and its protocol part
   */
  getSiteUrl(): string {
    return this.getConf("siteUrl");
  }

  getSiteProtocol(): string {
    const siteUrl: string = this.getSiteUrl();
    const result = siteUrl.match(/^.*:/);
    if ( result !== null ) {
      return result[0];
    }
    return "";
  }

  /**
   * URL of REST API
   */
  getUrl(label: string): string {
    return `${this.getConf("apiUrl")}/${label}`;
  }

  /**
   * Keys of Slug to ID
   */
  getSlugKeys(): string[] {
    const keys: string[] = this.getConf("slugKeys").split(",");
    return keys.map((key) => key.trim());
  }

  /**
   * ID of deafult featured image
   */
  getDefaultFeaturedImageId(): number {
    return this.getConf("defaultFeaturedImageId");
  }

  /**
   * Slug of featured image
   */
  getFeaturedImageSlug(documentSlug: string): string {
    const prefix: string = this.getConf("prefixFeaturedImageSlug");
    const suffix: string = this.getConf("suffixFeaturedImageSlug");
    const sep: string = this.getConf("slugSepalator");
    let result = documentSlug;
    if (prefix.trim() !== "") {
      result = prefix + sep + result;
    }
    if (suffix.trim() !== "") {
      result = result + sep + suffix;
    }
    return result;
  }

  /**
   * Slug of attached image
   */
  getAttachedImageSlug(originalSlug: string, documentSlug: string): string {
    const typeSlug: string = this.getConf("typeAttachedImageSlug");
    const sep: string = this.getConf("slugSepalator");
    if (typeSlug === "prefix") {
      return documentSlug + sep + originalSlug;
    } else if (typeSlug === "suffix") {
      return originalSlug + sep + documentSlug;
    } else {
      return originalSlug;
    }
  }

  /**
   * Slug of attached image thumbnail
   */
  getAttachedImageThumbnailSlug(imageSlug: string, width: number, height: number): string {
    const sep: string = this.getConf("slugSepalator");
    const size: string = width.toString() + "x" + height.toString();
    return imageSlug + sep + size;
  }

  /**
   * Media extensions
   */
  getMediaExtensions(): string[] {
    const mediaTypesStr: string = this.getConf("mediaTypes");
    const mediaTypes = mediaTypesStr.split(";");
    return mediaTypes.map((mType) => mType.split(",")[0].trim());
  }

  /**
   * Media type
   */
  getMediaType(extension: string): string {
    const mediaTypesStr: string = this.getConf("mediaTypes");
    const mediaTypes = mediaTypesStr.split(";");
    for (const mediaType of mediaTypes) {
      const kv = mediaType.split(",");
      if (kv[0].trim() === extension) {
        return kv[1].trim();
      }
    }
    throw new Error(`Not support media type : ${extension}`);
  }

  /**
   * Create relative Url
   */
  replaceAttachedImageUrl(imgSrc: string): string {
    const siteUrl: string = this.getConf("siteUrl");
    return imgSrc.replace(siteUrl, "");
  }

  useLinkableImage(): boolean {
    return this.getConf("useLinkableImage");
  }

  useLinkableImageOnlyIfSizeIsDifferent(): boolean {
    return this.getConf("useLinkableImageOnlyIfSizeIsDifferent");
  }
  
  enableLinkToImage([imgWidth, imgHeight] : [number, number], [linkWidth, linkHeight] : [number, number]): boolean {
    if ( !this.useLinkableImage() ) {
      return false;
    }
    if ( !this.useLinkableImageOnlyIfSizeIsDifferent() ) {
      return true;
    }

    return (imgWidth !== linkWidth) || (imgHeight !== linkHeight);  // return true if size is different
  }

  /**
   * Code Block
   */
  getCodeBlockStartTag(lang: string) : string {
    const prefix:string = this.getConf("codeBlockLanguagePrefix");
    const tag:string = this.getConf("codeBlockTag");
    if ( tag === "pre" ) {
      return "<pre class=\"" + prefix + lang + "\"><code>";
    } else {
      return "<pre><code class=\"" + prefix + lang + "\">";
    }
  }

  getCodeBlockEndTag() : string {
    return "</code></pre>";
  }

  /**
   * img tag
   */
  imageAddTitleAttribute(): boolean {
    return this.getConf("image.addTitleAttribute");
  }

  imageAddSizeAttributes(): boolean {
    return this.getConf("image.addSizeAttributes");
  }

  /**
   * Resizing image 
   */
  imageResize(): boolean {
    return this.getConf("image.resize");
  }

  getImageResizeJpegQuality(): number {
    return this.getConf("image.resizeJpegQuality");
  }

  useMozjpeg(): boolean {
    return this.getConf("image.resizeJpegUseMozjpeg");
  }

  usePngPalette(): boolean {
    return this.getConf("image.resizePngUsePalette");
  }

  getImageMaxSize(): [number, number] {
    return [this.getConf("image.maxWidth"), this.getConf("image.maxHeight")];
  }

  /**
   * Format generated HTML
   */
  getFormatHtml(): boolean {
    return this.getConf("formatHtml");
  }

  getAddBlankLineToH(): boolean {
    return this.getConf("formatHtmlAddBlankLineToHeaderTag");
  }

  getAddBlankLineToTable(): boolean {
    return this.getConf("formatHtmlAddBlankLineToTableBlock");
  }

  getAddBlankLineToPre(): boolean {
    return this.getConf("formatHtmlAddBlankLineToPreBlock");
  }

  getAddBlankLineToDiv(): boolean {
    return this.getConf("formatHtmlAddBlankLineToDivBlock");
  }

  /**
   * Generate Link to URL-like text
   */
  getEnableLinkify(): boolean {
    return this.getConf("enableLinkify");
  }

  /**
   * Custom Container
   */
  getCustomContainer(no : number) : [string, string, string] {
    const key : string = "customContainer.no" + no.toString().padStart(2, "0");
    const conf = vscode.workspace.getConfiguration(this.prefixOfSettings);
    const name : string = conf.get<string>(key + ".name", "");
    const openingTag : string = conf.get<string>(key + ".openingTag", "");
    const closingTag : string = conf.get<string>(key + ".closingTag", "");
    return [name, openingTag, closingTag];
  }

  /**
   * Custom span
   */
  useCustomSpan(): boolean {
    return this.getConf("useCustomSpan");
  }

  /**
   * Raw HTML Block
   */
  useRawHtmlBlock(): boolean {
      return this.getConf("useRawHtmlBlock");
  }

  getConf(id: string): any {
    return vscode.workspace.getConfiguration(this.prefixOfSettings).get(id);
  }

  debug(text: string) {
    if (this.outputChannel) {
      const now = new Date();
      this.outputChannel.appendLine(
        now.toLocaleTimeString("en", { hour12: false }) +
          "." +
          String(now.getMilliseconds()).padStart(3, "0") +
          " " +
          text
      );
    }
  }
}
