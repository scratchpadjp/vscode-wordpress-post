#!/bin/sh

# clean binaries
rm -rf node_modules/sharp/vendor/
rm -rf node_modules/sharp/build/Release/

# for win32-ia32 architecture
npm rebuild --platform=win32 --arch=ia32 sharp
npx vsce package --target win32-ia32

# clean binaries
rm -rf node_modules/sharp/vendor/
rm -rf node_modules/sharp/build/Release/

# for other architectures
npm rebuild --platform=win32 --arch=x64 sharp
npm rebuild --platform=darwin --arch=x64 sharp
npm rebuild --platform=darwin --arch=arm64 sharp
npm rebuild --platform=linux --arch=x64 sharp
npm rebuild --platform=linux --arch=arm64 sharp
npx vsce package
