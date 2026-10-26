# 📋 To-Do List Trong Ngày

Ứng dụng web quản lý công việc theo dòng thời gian trong ngày, tông màu trắng – xanh nước biển.

## Tính năng

- Thêm công việc kèm **giờ bắt đầu – giờ kết thúc**, danh sách tự sắp xếp theo giờ
- Thống kê: số việc, số việc đã xong, tổng thời gian trong ngày, số việc chưa xong trong tuần
- Thanh tiến độ % hoàn thành của ngày
- Việc **đã xong** hiện **tích xanh** ✅
- Việc **chưa làm** hiện **cảnh báo phải hoàn thành trong tuần** (hạn chót Chủ nhật), kèm số ngày còn lại; quá tuần thì báo **quá hạn** màu đỏ
- Lọc: Tất cả / Chưa làm / Đã xong
- Xem các ngày trước / sau, nút quay về hôm nay
- Cảnh báo khi khung giờ bị trùng
- Lưu dữ liệu bằng `localStorage` (không cần server)
- Giao diện responsive trên điện thoại

## Cấu trúc

```
├── index.html   # Giao diện
├── style.css    # Màu sắc & bố cục
├── script.js    # Logic xử lý
└── README.md
```

## Chạy thử

Mở trực tiếp file `index.html` bằng trình duyệt.

## Đưa lên GitHub & GitHub Pages

```bash
git init
git add .
git commit -m "To-do list trong ngày"
git branch -M main
git remote add origin https://github.com/<ten-ban>/<ten-repo>.git
git push -u origin main
```

Sau đó vào repo trên GitHub → **Settings → Pages** → mục *Source* chọn **Deploy from a branch**, branch `main`, thư mục `/ (root)` → **Save**.
Sau 1–2 phút trang sẽ chạy tại: `https://<ten-ban>.github.io/<ten-repo>/`
