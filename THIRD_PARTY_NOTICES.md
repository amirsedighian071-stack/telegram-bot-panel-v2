# References and third-party components

## Faoxima feature review

The services work was informed by the publicly available functionality and HTTP
integration interfaces of [Mmd-Amir/Faoxima](https://github.com/Mmd-Amir/Faoxima),
reviewed at commit `814344b017f19285574bec323d497a4612446bad`.
That repository includes a GNU GPL version 3 license. Its authors retain their
rights. This repository does not bundle its PHP application, installer, vendor
directory, branding, or font assets. Features and supported HTTP contracts are
mapped to newly organized JavaScript/Cloudflare modules. Preserve the upstream
license and attribution if importing any upstream implementation or assets in
future work; this notice does not grant additional rights to third-party code.

See `docs/FAOXIMA-CLOUDFLARE.fa.md` for implemented coverage, differences and
external dependencies. No production connectivity guarantee is made for upstream
panels, gateways or their untested versions.

## Runtime and UI dependencies

- Hono — MIT, https://github.com/honojs/hono
- fast-xml-parser — MIT, https://github.com/NaturalIntelligence/fast-xml-parser
- @noble/curves — MIT, https://github.com/paulmillr/noble-curves
- fflate — MIT, https://github.com/101arrowz/fflate
- qrcode-generator — MIT, https://github.com/kazuhikoarase/qrcode-generator
- Lucide — ISC; license bundled under `public/vendor/lucide-LICENSE`.
- Vazirmatn — SIL Open Font License; bundled under `public/vendor/vazirmatn-LICENSE`.
- Telegram Web App SDK — distributed from the official Telegram endpoint
  `https://telegram.org/js/telegram-web-app.js`, self-hosted as
  `public/vendor/telegram-web-app.js` for the customer Mini App. Telegram and its
  respective authors retain their rights. The SDK is not trusted as an
  authentication authority: initData is verified server-side.

Third-party dependencies retain the license notices in their packages. These
notices do not change ownership of the user's pre-existing project code.
