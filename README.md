# Bundai - YouTube Subtitle Language Helper

This is a browser extension (currently for YouTube) designed to help users learn languages. Hover over subtitle words to instantly see their meanings. The extension uses a spaced repetition system and a comprehensive learning system to enhance language acquisition. Future updates will connect this extension with our mobile app for a seamless learning experience.

## Getting Started

To start the development server:

```bash
pnpm run dev
```

Load the development build in your browser (e.g., for Chrome, use the `build/chrome-mv3-dev` directory).

You can start editing the extension by modifying files like `popup.tsx` or `contents/youtube-caption-manipulator.tsx`. Changes should auto-update during development.

## Production Build

To create a production bundle:

```bash
pnpm run build
```

The build will be ready for publishing to browser extension stores.

This should create a production bundle for your extension, ready to be 
zipped and published to the stores.

## Submit to the webstores

The easiest way to deploy your Plasmo extension is to use the built-in [bpp]
(https://bpp.browser.market) GitHub action. Prior to using this action 
however, make sure to build your extension and upload the first version to 
the store to establish the basic credentials. Then, simply follow [this 
setup instruction](https://docs.plasmo.com/framework/workflows/submit) and 
you should be on your way for automated submission
