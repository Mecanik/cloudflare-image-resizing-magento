/**
 * Worker Name: CloudFlare Image Resizing for Magento
 * Worker URI: https://github.com/Mecanik/cloudflare-image-resizing-magento
 * Description: This worker will replace Image URL's so you can use the CloudFlare Image Resizing service in Magento.
 * Version: 1.0
 * Author: Mecanik
 * Author URI: https://github.com/Mecanik/
 *
 * License: Apache License 2.0 (https://github.com/Mecanik/cloudflare-image-resizing-magento/blob/main/LICENSE)
 * Copyright (c) 2024 Mecanik
 **/

// Edit the below as needed
// START EDIT -----------------------------------------------------

// Set theme type
// 0 = Luma (Default Magento theme)
// 1 = Custom themes
const MAGENTO_THEME = 0;

// Speed: Set the image quality
const IMAGE_QUALITY = 90;

// Speed: Append lazy loading to images
const IMAGE_LAZY_LOAD = true;

// END EDIT -------------------------------------------------------
// DO NOT EDIT BELOW THIS LINE.

// Luma (Default Magento theme)
const SrcLuma = '(https?:\\/\\/(?:www\\.|(?!www))[^/]*)(\\/(?:media\\/catalog\\/product\\/cache\\/|media\\/wysiwyg\\/|pub\\/media\\/catalog\\/product\\/|pub\\/media\\/wysiwyg\\/|static\\/version\\d+\\/frontend\\/|static\\/frontend\\/).*?\\.(?:jpe?g|gif|png|webp|svg))(.*?)';
const rgxSrcLuma = new RegExp(`${SrcLuma}`, 'g');

// Custom themes (example paths, adjust as necessary)
const SrcCustom = '(https?:\\/\\/(?:www\\.|(?!www))[^/]*)(\\/(?:custom_path\\/|another_custom_path\\/|yet_another_custom_path\\/).*?\\.(?:jpe?g|gif|png|webp|svg))(.*?)';
const rgxSrcCustom = new RegExp(`${SrcCustom}`, 'g');

/**
 * Rewrites the <img> tags, including source sets, plugins like sliders, and more.
 * @version 1.0.0
 */
class ImageTagRewriter extends HTMLRewriter {
	async element(element) {
		// Base CDN
		let CDN = "/cdn-cgi/image/";
		let hasSizes = false;

		// Check if image has sizes set
		if (element.hasAttribute("width") && element.hasAttribute("height")) {
			const width = element.getAttribute("width");
			const height = element.getAttribute("height");

			if (width) {
				CDN += "width=" + width + ",";
			}
			if (height) {
				CDN += "height=" + height + ",";
			}
			if (width && height) hasSizes = true;
		}

		if (element.hasAttribute("src")) {
			if (hasSizes)
				CDN += `fit=crop,quality=${IMAGE_QUALITY},format=auto,onerror=redirect,metadata=none`;
			else
				CDN += `quality=${IMAGE_QUALITY},format=auto,onerror=redirect,metadata=none`;

			const src = element.getAttribute("src");

			// Ignore data/base64 images
			if (src && src.indexOf("base64") === -1) {
				if (src.indexOf('/cdn-cgi/image/') === -1) {
					let result;
					switch (MAGENTO_THEME) {
						case 0:
							result = src.replace(rgxSrcLuma, `$1${CDN}$2$3`);
							break;
						case 1:
							result = src.replace(rgxSrcCustom, `$1${CDN}$2$3`);
							break;
						default:
							break;
					}
					element.setAttribute("src", result);
				}
			}
		}
	}
}

/**
 * Rewrites the <li> tags, used to replace image sources for inline CSS (sliders and more)
 * @version 1.0.0
 */
class LiTagRewriter extends HTMLRewriter {
	async element(element) {
		if (element.hasAttribute("style")) {
			const style = element.getAttribute("style");
			if (style && style.indexOf('/cdn-cgi/image/') === -1) {
				const CDN = `/cdn-cgi/image/quality=${IMAGE_QUALITY},format=auto,onerror=redirect,metadata=none`;
				let result;
				switch (MAGENTO_THEME) {
					case 0:
						// Luma theme does not use this
						break;
					case 1:
						result = style.replace(rgxSrcCustom, `url('$1${CDN}$2$3')`);
						break;
					default:
						break;
				}
				element.setAttribute("style", result);
			}
		}
	}
}

/**
 * Entry point for worker in module syntax
 * @version 1.0.0
 */
export default {
	async fetch(request, env, ctx) {
		// We need to fetch the origin full response.
		const originResponse = await fetch(request);

		if (originResponse.status !== 200) {
			console.error(`Invalid Origin HTTP Status: ${originResponse.status}`);
			return originResponse;
		}

		const {
			pathname
		} = new URL(request.url);

		// Skip processing for Magento admin paths
		const adminPaths = ['/admin', '/admin_', '/index.php/admin', '/index.php/admin_'];
		if (adminPaths.some(adminPath => pathname.startsWith(adminPath))) {
			console.error(`Bypassing admin path: ${pathname}`);
			return originResponse;
		}

		// If the content type is HTML, we will run the rewriter
		const contentType = originResponse.headers.get("content-type");

		if (contentType === null) {
			console.error(`Missing Content Type: ${contentType}`);
			return originResponse;
		}

		if (contentType.startsWith("text/html")) {
			let newResponse = new HTMLRewriter()
				.on('img', new ImageTagRewriter())
				.on('li', new LiTagRewriter())
				.on('script', new ScriptTagRewriter())
				.transform(originResponse);

			return newResponse;
		} else {
			console.error(`Invalid Content Type: ${contentType}`);
			return originResponse;
		}
	}
}

