# PPTX Converter Worker

Worker convert PPTX -> PDF using LibreOffice headless.

## API

- `GET /health`
- `POST /convert/pptx-to-pdf`
  - Body: raw PPTX bytes
  - Headers:
    - `Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation` (or `application/octet-stream`)
    - `Authorization: Bearer <PPTX_CONVERTER_TOKEN>` (optional, if token configured)
  - Response: `application/pdf`

## Run locally

```bash
cd workers/pptx-converter
npm install
PPTX_CONVERTER_TOKEN=your-secret npm start
```

## Docker build/run

```bash
cd workers/pptx-converter
docker build -t fwf-pptx-converter .
docker run --rm -p 3000:3000 -e PPTX_CONVERTER_TOKEN=your-secret fwf-pptx-converter
```

## Deploy on Render (Blueprint)

Repo đã có sẵn `render.yaml` ở root để deploy worker tự động.

1. Push code mới lên GitHub.
2. Vào Render -> **New** -> **Blueprint** -> chọn repo này.
3. Render sẽ nhận service `fwf-pptx-converter` từ `render.yaml`.
4. Tại env của service, set:
   - `PPTX_CONVERTER_TOKEN=<your-secret>`
5. Deploy và chờ service live.
6. Test:

```bash
curl https://<render-domain>/health
```

## Vercel app env

Set in your Vercel project:

- `PPTX_CONVERTER_URL=https://<your-worker-domain>`
- `PPTX_CONVERTER_TOKEN=<same-secret-as-worker>`
- `PPTX_CONVERTER_TIMEOUT_MS=180000` (optional)

When `PPTX_CONVERTER_URL` is set, finalize route will call this worker instead of local `soffice`.
