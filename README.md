# FWF KPI Next.js Prototype

Prototype giao diện `Next.js + Tailwind CSS` cho hệ thống quản lý task và giám sát KPI đa phòng ban.

## Chạy dự án

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`.

## Cài đặt production để giữ đúng định dạng PPTX

Nếu muốn upload `.pptx` mà hiển thị giống file gốc, server **bắt buộc** có LibreOffice headless (`soffice`) và bộ font đầy đủ.

### 1) Ubuntu / Debian

```bash
sudo apt-get update
sudo apt-get install -y libreoffice-core libreoffice-impress libreoffice-writer fonts-noto fonts-dejavu fonts-liberation
soffice --version
```

### 2) Biến môi trường khuyến nghị

```bash
STRICT_PPTX_FIDELITY=true
```

- `true` (mặc định): nếu không convert được PPTX->PDF thì từ chối upload để tránh lệch định dạng.
- `false`: cho phép fallback text (nhanh hơn nhưng có thể sai bố cục/font).

### 3) Font thương hiệu riêng

- Nếu slide dùng font không phổ biến, cần cài font đó vào server.
- Khuyến nghị giảng viên export PDF chất lượng cao + embed font trước khi upload để đảm bảo fidelity.

### 4) Kiểm tra sau deploy

```bash
# upload 1 file PPTX mẫu có nhiều font
# xác nhận API /api/documents/upload/finalize không còn warning conversion fallback
```

## Biến môi trường realtime

Để bật realtime chat bằng Ably, thêm biến sau vào môi trường:

```bash
ABLY_API_KEY=your-ably-api-key
```

Nếu chưa cấu hình `ABLY_API_KEY`, chat vẫn hoạt động theo cơ chế fetch hiện tại nhưng chưa có push realtime.

## Thành phần chính

- `app/page.tsx`: entry page
- `app/login/page.tsx`: trang đăng nhập
- `app/register/page.tsx`: trang đăng ký
- `app/dashboard/page.tsx`: dashboard sau khi xác thực
- `components/dashboard-shell.tsx`: giao diện chính và dữ liệu mẫu
- `components/auth-provider.tsx`: state đăng nhập phía client
- `components/auth-shell.tsx`: form auth
- `lib/auth.ts`: dữ liệu mẫu, role, department, rule email công ty
- `app/globals.css`: global styles
- `tailwind.config.ts`: theme Tailwind

## Rule auth demo

- Chỉ chấp nhận email có đuôi `@facewashfox.com`
- Đăng ký có chọn `phòng ban` và `vai trò`
- Đăng ký phải qua bước xác minh `OTP` trước khi tạo tài khoản
- Đăng nhập xong sẽ vào dashboard theo tài khoản tương ứng
- Dữ liệu demo đang lưu ở `localStorage`

## Quyền nhân viên trong demo

- Với `task cá nhân`: thêm mới, sửa, xóa, ghi chú, cập nhật tiến độ và trạng thái
- Với `task trong nhóm`: chỉ xem để theo dõi, không được thao tác

## Tài khoản mẫu

- `admin@facewashfox.com` / `facewashfox123`
- `director@facewashfox.com` / `facewashfox123`
- `lan.tran@facewashfox.com` / `facewashfox123`
- `trang.nguyen@facewashfox.com` / `facewashfox123`

<!-- FRIGATE -->
tls:
  enabled: false

auth:
  enabled: true
  reset_admin_password: false

mqtt:
  enabled: false

ffmpeg:
  input_args: preset-rtsp-restream

go2rtc:
  streams:
    vista_Verde_cam_sofa:
      - rtsp://vistaverde01:Fwfvista@fwfvista.ddns.net:1554/stream2
    landmark81_letan_01:
      - rtsp://landmark01:Fwf%40landmark@fwflandmark.ddns.net:1554/stream2
    vista_Verde_cam_Letan:
      - rtsp://vistaverde03:Fwf%40vistaverde@fwfvista.ddns.net:3554/stream2
    vista_Verde_cam_bed:
      - rtsp://vistaverde04:Fwf%40vistaverde@fwfvista.ddns.net:4554/stream2
    vista_Verde_cam_kho:
      - rtsp://vistaverde05:Fwf%40vistaverde@fwfvista.ddns.net:5554/stream2
    vista_Verde_cam_cua:
      - rtsp://vistaverde06:Fwf%40vistaverde@fwfvista.ddns.net:6554/stream2
    vincom_thaodien_letan:
      - rtsp://thaodien01:Fwf%40thaodien@fwfthaodien.ddns.net:1554/stream2
    sun_avenue_bed:
      - rtsp://sunavenue02:Fwf%40sunavenue@fwfsunavenue.ddns.net:2554/stream2
    vincom_thaodien_bed:
      - rtsp://thaodien02:Fwf%40thaodien@fwfthaodien.ddns.net:2554/stream2

cameras:
  vista_Verde_cam_sofa:
    ffmpeg:
      inputs:
        - path: rtsp://127.0.0.1:8554/vista_Verde_cam_sofa
          roles:
          
            - record
    detect:
      enabled: false
      
    record:
      enabled: true

  landmark81_letan_01:
    ffmpeg:
      inputs:
        - path: rtsp://127.0.0.1:8554/landmark81_letan_01
          roles:
            - record
    detect:
      enabled: false
    record:
      enabled: true

  vista_Verde_cam_Letan:
    ffmpeg:
      inputs:
        - path: rtsp://127.0.0.1:8554/vista_Verde_cam_Letan
          roles:
            - record
    detect:
      enabled: false
    record:
      enabled: true

  vista_Verde_cam_bed:
    ffmpeg:
      inputs:
        - path: rtsp://127.0.0.1:8554/vista_Verde_cam_bed
          roles:
            - record
    detect:
      enabled: false
    record:
      enabled: true

  vista_Verde_cam_kho:
    ffmpeg:
      inputs:
        - path: rtsp://127.0.0.1:8554/vista_Verde_cam_kho
          roles:
            - record
    detect:
      enabled: false
    record:
      enabled: true

  vista_Verde_cam_cua:
    ffmpeg:
      inputs:
        - path: rtsp://127.0.0.1:8554/vista_Verde_cam_cua
          roles:
            - record
    detect:
      enabled: false
    record:
      enabled: true

  vincom_thaodien_letan:
    ffmpeg:
      inputs:
        - path: rtsp://127.0.0.1:8554/vincom_thaodien_letan
          roles:
            - record
    detect:
      enabled: false
    record:
      enabled: true

  sun_avenue_bed:
    ffmpeg:
      inputs:
        - path: rtsp://127.0.0.1:8554/sun_avenue_bed
          roles:
            - record
    detect:
      enabled: false
    record:
      enabled: true

  vincom_thaodien_bed:
    ffmpeg:
      inputs:
        - path: rtsp://127.0.0.1:8554/vincom_thaodien_bed
          roles:
            - record
    detect:
      enabled: false
    record:
      enabled: true

version: 0.17-0

camera_groups:
  Vista_Verde:
    order: 1
    icon: LuListVideo
    cameras:
      - vista_Verde_cam_sofa
      - vista_Verde_cam_bed_2
      - vista_Verde_cam_Letan
      - vista_Verde_cam_bed
      - vista_Verde_cam_kho
      - vista_Verde_cam_cua
  vincom_thảo_điền:
    order: 2
    icon: LuListVideo
    cameras:
      - vincom_thaodien_letan
      - vincom_thaodien_bed
  landmark_81:
    order: 3
    icon: LuListVideo
    cameras: landmark81_letan_01
  sun_avenue:
    order: 4
    icon: LuListVideo
    cameras: sun_avenue_bed
