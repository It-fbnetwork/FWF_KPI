import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const docsDir = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.join(docsDir, "huong-dan-dang-ky-dang-nhap.docx");

const images = [
  { id: "loginForm", file: "assets/auth/login-form.png", title: "Màn hình đăng nhập bằng email" },
  { id: "loginOtp", file: "assets/auth/login-otp.png", title: "Màn hình nhập OTP đăng nhập" },
  { id: "registerForm", file: "assets/auth/register-form.png", title: "Màn hình đăng ký tài khoản theo phòng ban" },
  { id: "registerStore", file: "assets/auth/register-store.png", title: "Ví dụ đăng ký tài khoản thuộc phòng ban Cửa hàng" },
  { id: "registerOtp", file: "assets/auth/register-otp.png", title: "Màn hình nhập OTP đăng ký" },
  { id: "approvalPending", file: "assets/auth/approval-pending.png", title: "Thông báo tài khoản đang chờ admin/CEO duyệt" }
].map((item, index) => ({
  ...item,
  relId: `rId${index + 1}`,
  mediaName: `image${index + 1}.png`
}));

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function run(text, opts = {}) {
  const props = [
    opts.bold ? "<w:b/>" : "",
    opts.italic ? "<w:i/>" : "",
    opts.color ? `<w:color w:val="${opts.color}"/>` : "",
    opts.size ? `<w:sz w:val="${opts.size}"/>` : ""
  ].join("");

  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

function paragraph(parts = "", style = "BodyText") {
  const body = Array.isArray(parts) ? parts.join("") : run(parts);
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${body}</w:p>`;
}

function bullet(text) {
  return paragraph(`- ${text}`, "BodyText");
}

function numbered(number, text) {
  return paragraph(`${number}. ${text}`, "BodyText");
}

function imageBlock(image) {
  const cx = 5486400;
  const cy = 4191000;
  return `
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r>
        <w:drawing>
          <wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
            <wp:extent cx="${cx}" cy="${cy}"/>
            <wp:effectExtent l="0" t="0" r="0" b="0"/>
            <wp:docPr id="${image.relId.replace("rId", "")}" name="${xmlEscape(image.title)}"/>
            <wp:cNvGraphicFramePr>
              <a:graphicFrameLocks noChangeAspect="1" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>
            </wp:cNvGraphicFramePr>
            <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:nvPicPr>
                    <pic:cNvPr id="${image.relId.replace("rId", "")}" name="${xmlEscape(image.mediaName)}"/>
                    <pic:cNvPicPr/>
                  </pic:nvPicPr>
                  <pic:blipFill>
                    <a:blip r:embed="${image.relId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                    <a:stretch><a:fillRect/></a:stretch>
                  </pic:blipFill>
                  <pic:spPr>
                    <a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
                    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                  </pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
    ${paragraph(image.title, "Caption")}
  `;
}

const imageById = Object.fromEntries(images.map((image) => [image.id, image]));

const documentBody = [
  paragraph("Hướng dẫn đăng ký và đăng nhập FWF KPI", "Title"),
  paragraph("Tài liệu thao tác chi tiết kèm màn hình ví dụ cho người dùng.", "Subtitle"),
  paragraph("Tài liệu này mô tả luồng đăng ký và đăng nhập hiện tại của project FWF KPI. Hệ thống không dùng mật khẩu ở màn hình đăng nhập/đăng ký mới; người dùng xác thực bằng mã OTP 6 số gửi qua email."),

  paragraph("1. Chuẩn bị trước khi thao tác", "Heading1"),
  bullet("Truy cập app tại /login để đăng nhập hoặc /register để đăng ký."),
  bullet("Có thể dùng Email công ty dạng ten@facewashfox.com hoặc Email cá nhân."),
  bullet("OTP có hiệu lực trong 5 phút."),
  bullet("Sau khi gửi OTP, nút gửi lại sẽ bị khóa 30 giây."),
  bullet("Nếu môi trường chưa cấu hình SMTP thật, server cần bật OTP_DEBUG=true; frontend muốn hiện OTP demo cần bật NEXT_PUBLIC_OTP_DEBUG=true."),

  paragraph("2. Đăng nhập", "Heading1"),
  paragraph("Bước 1: Mở màn hình đăng nhập", "Heading2"),
  paragraph("Vào /login. Chọn loại email rồi nhập email đã có tài khoản trong hệ thống."),
  imageBlock(imageById.loginForm),
  paragraph("Với Email công ty, người dùng chỉ cần nhập phần trước @facewashfox.com; hệ thống tự gắn domain công ty. Với Email cá nhân, nhập đầy đủ địa chỉ email."),
  paragraph("Bước 2: Gửi OTP đăng nhập", "Heading2"),
  paragraph("Nhấn Gửi OTP đăng nhập. Hệ thống chỉ gửi OTP nếu:"),
  bullet("Email đã tồn tại trong bảng người dùng."),
  bullet("Tài khoản đã được xác minh."),
  bullet("Tài khoản không đang ở trạng thái chờ admin/CEO duyệt."),
  paragraph("Các lỗi thường gặp:"),
  bullet("Không tìm thấy tài khoản phù hợp: email chưa có tài khoản."),
  bullet("Tài khoản chưa xác minh email bằng OTP: tài khoản chưa hoàn tất xác minh."),
  bullet("Tài khoản đã xác thực OTP và đang chờ admin gốc duyệt: tài khoản cần đợi phê duyệt."),
  bullet("Chưa cấu hình SMTP để gửi OTP thật: môi trường chưa có SMTP và không bật debug OTP."),
  paragraph("Bước 3: Nhập OTP", "Heading2"),
  paragraph("Nhập đủ 6 số OTP đã nhận qua email, sau đó nhấn Xác minh OTP."),
  imageBlock(imageById.loginOtp),
  paragraph("Nếu OTP đúng và còn hạn, hệ thống tạo session rồi chuyển người dùng vào /dashboard. Nếu OTP sai hoặc hết hạn, màn hình sẽ báo lỗi và người dùng cần nhập lại hoặc gửi lại OTP."),

  paragraph("3. Đăng ký tài khoản", "Heading1"),
  paragraph("Bước 1: Mở màn hình đăng ký", "Heading2"),
  paragraph("Vào /register. Nhập họ tên, chọn loại email, nhập email, chọn phòng ban và vai trò."),
  imageBlock(imageById.registerForm),
  paragraph("Quy tắc chọn vai trò:"),
  bullet("Các phòng ban văn phòng có các vai trò: Nhân viên, Leader, CEO, Admin."),
  bullet("Khi chọn CEO, phòng ban hiệu lực được đặt là Vận hành."),
  bullet("Phòng ban Cửa hàng chỉ dùng các vai trò cửa hàng: Trainer, Quản lí cửa hàng, Cửa hàng trưởng, Kỹ thuật viên."),
  paragraph("Bước 2: Điền thông tin riêng cho phòng ban Cửa hàng", "Heading2"),
  paragraph("Nếu chọn phòng ban Cửa hàng, form sẽ hiện thêm trường theo vai trò."),
  imageBlock(imageById.registerStore),
  paragraph("Quy tắc hiện tại:"),
  bullet("Trainer: không cần chọn khu vực hoặc chi nhánh."),
  bullet("Quản lí cửa hàng: chọn Khu vực; hệ thống gán toàn bộ chi nhánh thuộc khu vực đó."),
  bullet("Cửa hàng trưởng: chọn Khu vực và đúng 1 Chi nhánh."),
  bullet("Kỹ thuật viên: chọn Cửa hàng trưởng quản lý; nếu chưa có cửa hàng trưởng khả dụng, hệ thống dùng Trainer làm quản lý tạm thời."),
  paragraph("Bước 3: Gửi OTP đăng ký", "Heading2"),
  paragraph("Nhấn Gửi OTP. Hệ thống kiểm tra:"),
  bullet("Họ tên không được trống."),
  bullet("Email chưa tồn tại."),
  bullet("Email không đang có yêu cầu duyệt pending."),
  bullet("Vai trò cửa hàng chỉ được dùng với phòng ban Cửa hàng."),
  bullet("Thông tin khu vực, chi nhánh hoặc quản lý cửa hàng phải hợp lệ theo vai trò."),
  paragraph("Nếu hợp lệ, hệ thống tạo OTP 6 số và gửi tới email."),
  paragraph("Bước 4: Xác nhận OTP đăng ký", "Heading2"),
  paragraph("Nhập OTP rồi nhấn Xác minh OTP."),
  imageBlock(imageById.registerOtp),
  paragraph("Nếu vai trò không cần duyệt, hệ thống tạo tài khoản, tạo/cập nhật hồ sơ nhân sự tương ứng và đăng nhập người dùng vào dashboard."),
  paragraph("Nếu OTP sai hoặc hết hạn, hệ thống hiển thị lỗi:"),
  bullet("OTP không chính xác."),
  bullet("OTP đã hết hạn. Vui lòng gửi lại OTP."),
  bullet("Không tìm thấy yêu cầu xác minh phù hợp."),

  paragraph("4. Trường hợp cần admin/CEO duyệt", "Heading1"),
  paragraph("Theo logic server hiện tại, các vai trò sau cần duyệt sau khi xác minh OTP:"),
  bullet("Leader"),
  bullet("Admin"),
  bullet("CEO"),
  paragraph("Sau khi OTP hợp lệ, tài khoản chưa đăng nhập ngay mà chuyển sang trạng thái chờ duyệt."),
  imageBlock(imageById.approvalPending),
  paragraph("Người dùng cần chờ admin/CEO duyệt. Sau khi được duyệt, hệ thống gửi email thông báo và người dùng có thể quay lại /login để đăng nhập bằng OTP."),

  paragraph("5. Ghi chú vận hành", "Heading1"),
  bullet("API gửi OTP đăng nhập: POST /api/auth/login"),
  bullet("API xác minh OTP đăng nhập: POST /api/auth/login/verify-otp"),
  bullet("API gửi OTP đăng ký: POST /api/auth/register/request-otp"),
  bullet("API xác minh OTP đăng ký: POST /api/auth/register/verify-otp"),
  bullet("Component giao diện chính: components/auth-shell.tsx"),
  bullet("Provider gọi API auth: components/auth-provider.tsx"),
  bullet("Logic server tạo/xác minh OTP: lib/server/data.ts"),
  bullet("Cấu hình gửi email OTP: lib/server/mailer.ts"),

  paragraph("6. Checklist nhanh cho người dùng", "Heading1"),
  paragraph("Đăng ký", "Heading2"),
  numbered(1, "Vào /register."),
  numbered(2, "Nhập họ tên."),
  numbered(3, "Chọn loại email và nhập email."),
  numbered(4, "Chọn phòng ban, vai trò và thông tin cửa hàng nếu có."),
  numbered(5, "Nhấn Gửi OTP."),
  numbered(6, "Nhập OTP 6 số."),
  numbered(7, "Nếu tài khoản cần duyệt, chờ admin/CEO duyệt trước khi đăng nhập."),
  paragraph("Đăng nhập", "Heading2"),
  numbered(1, "Vào /login."),
  numbered(2, "Chọn loại email và nhập email đã đăng ký."),
  numbered(3, "Nhấn Gửi OTP đăng nhập."),
  numbered(4, "Nhập OTP 6 số."),
  numbered(5, "Nhấn Xác minh OTP để vào dashboard.")
].join("");

const zip = new JSZip();

zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);

zip.folder("_rels").file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

zip.folder("word").file("document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    ${documentBody}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`);

zip.folder("word").file("styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="BodyText">
    <w:name w:val="Body Text"/>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/><w:color w:val="1F2937"/></w:rPr>
    <w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="48"/><w:color w:val="111827"/></w:rPr>
    <w:pPr><w:spacing w:after="180"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle">
    <w:name w:val="Subtitle"/>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="26"/><w:color w:val="6B7280"/></w:rPr>
    <w:pPr><w:spacing w:after="260"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="BodyText"/>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="34"/><w:color w:val="1F2937"/></w:rPr>
    <w:pPr><w:spacing w:before="360" w:after="160"/><w:keepNext/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="BodyText"/>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="26"/><w:color w:val="374151"/></w:rPr>
    <w:pPr><w:spacing w:before="240" w:after="120"/><w:keepNext/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Caption">
    <w:name w:val="Caption"/>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:i/><w:sz w:val="19"/><w:color w:val="6B7280"/></w:rPr>
    <w:pPr><w:jc w:val="center"/><w:spacing w:after="180"/></w:pPr>
  </w:style>
</w:styles>`);

zip.folder("word").folder("_rels").file("document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${images.map((image) => `<Relationship Id="${image.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${image.mediaName}"/>`).join("\n  ")}
</Relationships>`);

for (const image of images) {
  const imagePath = path.join(docsDir, image.file);
  zip.folder("word").folder("media").file(image.mediaName, fs.readFileSync(imagePath));
}

const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
fs.writeFileSync(outFile, buffer);
console.log(`Created ${outFile}`);
