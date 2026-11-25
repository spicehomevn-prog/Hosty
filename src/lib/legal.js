// Điều khoản & Chính sách bảo mật: phiên bản hiện hành + thông tin đơn vị vận hành (dùng chung app và máy chủ).
// Đổi POLICY_VERSION mỗi khi sửa nội dung hai trang; máy chủ lưu phiên bản người dùng đã đồng ý khi đăng ký.
export const POLICY_VERSION = '2026-11-25';
export const POLICY_DATE = '25/11/2026';

/**
 * Thông tin đơn vị vận hành, điền đủ thì tự hiện ở cuối hai trang (để trống thì ẩn dòng đó).
 * Luật TMĐT 122/2025 yêu cầu công bố tên chủ sở hữu, địa chỉ, mã số thuế, email, số điện thoại.
 */
export const OPERATOR = {
  name: '',     // tên pháp nhân / hộ kinh doanh
  taxId: '',    // mã số thuế / số đăng ký kinh doanh
  address: '',
  email: '',
};
