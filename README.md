# PhotoPrivacyTool V1

Static multilingual privacy-focused web app to view EXIF metadata, check GPS location and create clean image copies entirely in the browser.

## Stack
- Real static HTML pages per route
- Reusable CSS
- Modular vanilla JavaScript
- No backend
- No Pages Functions
- Cloudflare Pages compatible through Git integration

## Important configuration
This project uses `https://photoprivacytool.pages.dev` in:
- `sitemap.xml`
- `robots.txt`
- canonical and hreflang tags
- JSON-LD schema

If your final Pages URL or custom domain is different, replace that value before going live.

## Local preview
Because the site is fully static, you can preview it with any local static server, for example:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Deploy to Cloudflare Pages from GitHub
1. Push this repository to GitHub.
2. In Cloudflare Dashboard, go to **Workers & Pages**.
3. Choose **Create application** > **Pages** > **Import an existing Git repository**.
4. Select the GitHub repo and start setup.
5. Use:
   - **Production branch:** `main`
   - **Build command:** `exit 0`
   - **Build output directory:** `.`
6. Save and deploy.

Cloudflare's Static HTML guide states that for sites that do not need a build step, you can use `exit 0` as the build command and set the output directory to the folder that contains the static site. In this project that is the repo root. See Cloudflare Pages docs for Static HTML and Git integration.

## Known behavior
- JPG/JPEG: supported for EXIF reading and clean-copy generation
- PNG: basic eXIf reading support, clean-copy generation supported
- HEIC/HEIF: intentionally shown as not reliably supported in V1
- Remove GPS: implemented by creating a clean local copy without the original EXIF block, which also removes the rest of EXIF metadata

## Structure
- `/index.html` neutral landing with language selector
- `/es/...` Spanish pages
- `/en/...` English pages
- `/assets/css/styles.css` shared styles
- `/assets/js/exif-reader.js` lightweight browser EXIF reader
- `/assets/js/image-cleaner.js` clean-copy generator via Canvas
- `/assets/js/tool-ui.js` upload, drag-and-drop and result rendering

## Launch checklist
- Replace `https://photoprivacytool.pages.dev` if needed
- Review legal copy for your jurisdiction
- Add your own brand/legal entity details if required
- Optionally add a custom domain in Cloudflare Pages
