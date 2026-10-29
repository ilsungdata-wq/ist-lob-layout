# IST LOB Reports — MCP chỉ đọc

## Trạng thái bàn giao

Mã nguồn + kiểm thử mock; **chưa triển khai Supabase, chưa kết nối ChatGPT, chưa xác nhận dữ liệu production**.
GitHub Pages phục vụ web tĩnh, không chạy endpoint MCP. Function mới chạy riêng trên Supabase Edge Functions.
Không cần OpenAI API key. Không thay đổi bảng, migrations hay giao diện hiện có.

## Phạm vi

| Công cụ | Dữ liệu |
| --- | --- |
| `list_published_models` | Model hiện publish, revision, MP/UPH/LOB và các chỉ số nguồn |
| `get_published_processes` | Công đoạn của phiên bản đang publish, phân trang |
| `list_standard_times` | GH96, Model, loại sản phẩm, đơn giá, Labor cost, S/T |
| `get_price_history` | Tối đa 100 mốc giá/S/T gần nhất của một GH96, giới hạn từ RPC hiện hữu |
| `list_labor_cost_history` | Labor cost theo ngày hiệu lực |

Không đọc draft, không import/sync/publish/xóa, không SQL tùy ý. Dữ liệu là kế hoạch/thương mại;
không suy diễn thành sản lượng hay chấm công thực tế. `retrieved_at` là giờ truy vấn, không phải giờ ERP đồng bộ.
Đọc hết `next_offset` trước khi tính tổng. API không bảo đảm snapshot xuyên nhiều trang khi nguồn đang thay đổi.
Giữ nguyên đơn vị nguồn; LOB là tỷ lệ (nhân 100 để hiển thị %). Không tự gộp S/T thương mại với thời gian công đoạn.
Giới hạn lịch sử 100 mốc không thể khắc phục bằng lọc ngày; báo cáo dài hạn cần thêm RPC có phân trang thực sự.

## Bảo vệ truy cập

Mọi thao tác MCP yêu cầu OAuth access token đã kiểm tra chữ ký, issuer, audience, exp, iat, sub,
scope `reports:read` và danh sách subject được phép. Metadata OAuth không chứa dữ liệu nghiệp vụ.
Quyền này là quyền **đọc toàn bộ 5 nhóm báo cáo**, chỉ cấp cho người được phép xem đơn giá/S/T.
Không tự ánh xạ quyền OAuth vào tài khoản/Model của webapp. Không cấp cho viewer hạn chế từng Model.

Supabase upstream chỉ dùng `SUPABASE_ANON_KEY` và 5 RPC đã có; tuyệt đối không dùng service-role.
Token OAuth không chuyển tiếp tới Supabase. Không truyền mật khẩu webapp hay mật khẩu S/T qua tool arguments.
RPC hiện hữu có quyền anon và mật khẩu trang S/T là lớp riêng; function này không sửa hoặc bảo đảm an toàn
cho các đường đọc cũ của ứng dụng. Trước khi chạy thật, quản trị viên xác nhận phạm vi báo cáo cho từng subject.

## Triển khai

1. Checkout nhánh chứa thay đổi này trong repository, dùng Supabase CLI đã đăng nhập đúng project.
2. Dùng OAuth/OIDC provider hỗ trợ authorization code + PKCE S256 và discovery. Provider phải hỗ trợ
   đăng ký client tương thích ChatGPT (DCR/CIMD hoặc client đăng ký sẵn); cấp refresh token nếu cần kết nối lâu dài.
   Không mặc định Supabase Auth hiện tại đã bật OAuth server. Tạo resource/audience đúng URL bên dưới,
   scope `reports:read`, hạn chế người đăng nhập, lấy issuer/JWKS từ discovery chính thức của provider.
3. Cấu hình bí mật trong Supabase Dashboard → Edge Functions → Secrets:

| Biến | Giá trị |
| --- | --- |
| `REPORTING_MCP_URL` | `https://<PROJECT_REF>.supabase.co/functions/v1/reporting-mcp` (không dấu / cuối) |
| `REPORTING_OAUTH_ISSUER` | Issuer chính xác từ provider (giữ dấu / cuối nếu có) |
| `REPORTING_JWKS_URL` | HTTPS JWKS endpoint của provider |
| `REPORTING_ALLOWED_SUBJECTS` | Các OAuth `sub` đã phê duyệt, ngăn bằng dấu phẩy; không phải email tự suy đoán |

`SUPABASE_URL` và `SUPABASE_ANON_KEY` là biến mặc định của Edge Functions. Không commit secrets.

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy reporting-mcp --no-verify-jwt
```

`--no-verify-jwt` chỉ tắt gateway JWT Supabase: function vẫn bắt buộc tự kiểm tra OAuth JWT bên trong.
Không chạy `db push`: thay đổi này không cần migration. Xác nhận project đã có đủ 5 RPC ở trên.

4. Kiểm tra endpoint bằng MCP Inspector/client tương thích Streamable HTTP: initialize, tools/list,
   gọi thử cả 5 công cụ, so sánh một Model và một GH96 với webapp. Kiểm tra token sai issuer/audience,
   hết hạn, sai scope, user ngoài allowlist đều bị chặn. Test ở phần cuối chỉ mock xác thực, không thay thế bước này.
5. Tạo kết nối MCP tùy chỉnh trong ChatGPT nếu tài khoản/workspace có tính năng này: tên **IST LOB Reports**,
   URL `REPORTING_MCP_URL`, phương thức OAuth. Hoàn tất đăng nhập. Thử chọn app bằng `@` sau khi kết nối thành công.
   Nếu giao diện không có tùy chọn thêm MCP, cần kiểm tra quyền/tính năng tài khoản; thêm mã vào GitHub không tự tạo app.

OAuth protected-resource metadata ở URL `${REPORTING_MCP_URL}/.well-known/oauth-protected-resource`, được chỉ rõ
trong header `WWW-Authenticate`. Function hỗ trợ JSON responses của Streamable HTTP, không SSE stream dài,
không session state, không legacy SSE transport. Bản protocol: 2025-03-26, 2025-06-18, 2025-11-25.
Origin cho phép: `https://chatgpt.com`; client server-to-server có thể không gửi Origin.
Nếu cần browser Inspector, bổ sung allowlist Origin/CORS một cách tường minh, không dùng wildcard.
Thiết lập giới hạn lưu lượng ở hạ tầng nếu mở cho nhiều người. Lỗi upstream được che nội dung nhạy cảm.

## Câu lệnh sử dụng

- `@IST LOB Reports Tổng hợp MP, UPH và LOB của tất cả Model đã publish. Ghi rõ revision và thời điểm lấy dữ liệu.`
- `@IST LOB Reports Liệt kê đơn giá, Labor cost và S/T của Model F731 Main theo từng mã GH96.`
- `@IST LOB Reports So sánh các mốc giá gần nhất của GH96-15936A, ghi rõ phạm vi lịch sử mà nguồn trả về.`

## Kiểm thử local

```bash
node --test tests/reporting-mcp.test.mjs
```

Kiểm thử sử dụng dữ liệu giả và verifier giả: kiểm tra luồng HTTP, phân quyền scope/subject/expiry,
RPC allowlist, tham số, phân trang, giới hạn lịch sử, xử lý lỗi và không chuyển OAuth token sang database.
Chưa kiểm tra chữ ký JWT/JWKS thật, Deno deployment, OAuth redirect hoặc ChatGPT end-to-end.

Tham khảo: https://developers.openai.com/plugins/build/auth
và https://modelcontextprotocol.io/specification/2025-11-25/basic/transports

Rollback: ngừng/xóa function `reporting-mcp`, gỡ app khỏi ChatGPT và thu hồi OAuth client/token.
Không có thay đổi dữ liệu cần rollback.
