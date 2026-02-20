ภาพรวมโครงการ
สร้างระบบ Web Application สำหรับจัดการและเปรียบเทียบราคาสินค้าจาก Supplier หลายราย โดยมีการ import ข้อมูลผ่าน Excel, แสดงกราฟเปรียบเทียบราคา, และจัดการผู้ใช้งานแบบหลายระดับเทคโนโลยีที่ใช้

Backend: Node.js + Express.js
Frontend: HTML, CSS, JavaScript (Vanilla JS หรือใช้ library เช่น Chart.js สำหรับกราฟ)
Database: SQLite3 (ไฟล์ .db)
การจัดการไฟล์: Multer (สำหรับ upload Excel และรูปภาพ)
การอ่าน Excel: xlsx หรือ exceljs
Authentication: express-session + bcrypt สำหรับ hash password
ฟีเจอร์หลักของระบบ1. ระบบ Supplier Portal (User Role: Supplier)1.1 การ Login และ Authentication

Supplier แต่ละรายมี username และ password เฉพาะตัว
ระบบ session management เพื่อจำการ login
Password ต้อง hash ด้วย bcrypt ก่อนเก็บในฐานข้อมูล
1.2 หน้าจอหลักของ Supplier
ฟีเจอร์:

แสดงรายการสินค้าที่ Supplier นี้เสนอราคาเท่านั้น (ไม่เห็นของ Supplier อื่น)
ตารางแสดงข้อมูล:

รหัสสินค้าของ Supplier
ชื่อสินค้า
ราคาล่าสุด
หน่วย (เช่น ลิตร, กก.)
วันที่อัพเดตล่าสุด
สถานะ (Active/Inactive)


1.3 ระบบ Import ราคาผ่าน Excel
การทำงาน:

มีปุ่ม "Download Excel Template" ให้ Supplier ดาวน์โหลดแบบฟอร์มมาตรฐาน
Excel Template มีคอลัมน์:

รหัสสินค้า (Supplier Product Code) - required
ชื่อสินค้า (Product Name) - required
ราคา (Price) - required, ต้องเป็นตัวเลข
หน่วย (Unit) - required
วันที่มีผล (Effective Date) - required, รูปแบบ DD/MM/YYYY
หมายเหตุ (Remark) - optional


Supplier กรอกข้อมูลในไฟล์ Excel แล้ว upload กลับเข้าระบบ
ระบบ validate ข้อมูล:

ตรวจสอบ format คอลัมน์ถูกต้อง
ตรวจสอบข้อมูลซ้ำ
แจ้งเตือนหากมี error พร้อมระบุแถวที่ผิด


หลัง validate ผ่าน ให้แสดงหน้า Preview ก่อน confirm import
เมื่อ confirm แล้ว บันทึกข้อมูลลงฐานข้อมูล พร้อม log ประวัติการ import
1.4 กราฟแสดงประวัติราคาสินค้า
ฟีเจอร์:

เลือกดูสินค้าแต่ละรายการ
แสดง Line Chart ราคาย้อนหลัง 12 เดือน
แกน X: เดือน-ปี
แกน Y: ราคา
สามารถ zoom in/out ดูรายละเอียด
แสดงค่าเฉลี่ย, ราคาสูงสุด, ราคาต่ำสุด ในช่วงเวลาที่เลือก
1.5 การจัดการข้อมูลสินค้า

แก้ไขข้อมูลสินค้าแบบ manual (กรณีไม่ต้องการ import)
เพิ่มสินค้าใหม่
ระบุสถานะ Active/Inactive
2. ระบบ Procurement Portal (User Role: Buyer)2.1 การ Login และ Authentication

Buyer มี username และ password เข้าระบบ
สิทธิ์แตกต่างจาก Supplier (มองเห็นข้อมูลทุก Supplier)
2.2 หน้าจอ Dashboard
ฟีเจอร์:

แสดงภาพรวมจำนวน Supplier ที่ active
จำนวนสินค้าทั้งหมดในระบบ
จำนวนสินค้าที่จัดกลุ่มแล้ว vs ยังไม่จัดกลุ่ม
สินค้าที่มีการอัพเดตราคาล่าสุด (7 วันล่าสุด)
2.3 ระบบจัดกลุ่มสินค้า (Product Grouping)
ปัญหาที่แก้:

สินค้าเดียวกัน (เช่น กรดซัลฟิวริก 98%) แต่ละ Supplier ใช้รหัสสินค้าต่างกัน
ต้องการจัดกลุ่มเพื่อเปรียบเทียบราคา
ฟีเจอร์:

หน้าจัดการกลุ่มสินค้า (Product Master)

ตารางแสดงกลุ่มสินค้าทั้งหมด
สร้างกลุ่มสินค้าใหม่:

Master Product Code (รหัสสินค้ามาตรฐานบริษัท)
Master Product Name (ชื่อสินค้ามาตรฐาน)
Category/หมวดหมู่ (เช่น เคมีภัณฑ์, สี, กรด)
Unit มาตรฐาน
รูปภาพสินค้า (upload ได้)
Specification/รายละเอียด





การ Mapping สินค้า Supplier เข้ากลุ่ม

หน้าจอแสดงสินค้าของ Supplier ทั้งหมดที่ยังไม่ได้จัดกลุ่ม
ระบบแนะนำการจัดกลุ่มอัตโนมัติ (ถ้าชื่อสินค้าคล้ายกัน 70%+)
Drag & Drop หรือเลือก checkbox เพื่อ map สินค้าเข้ากลุ่ม
สามารถ map สินค้า Supplier หลายรายเข้ากลุ่มเดียวกัน
บันทึก mapping พร้อม log ว่าใครจัด เมื่อไหร่


2.4 หน้าเปรียบเทียบราคา
ฟีเจอร์:

ตารางเปรียบเทียบราคา

กรองตามกลุ่มสินค้า/Category
แสดงคอลัมน์:

Master Product Code & Name
Supplier 1: รหัส, ชื่อ, ราคาล่าสุด, วันที่อัพเดต
Supplier 2: ...
Supplier n: ...
ราคาเฉลี่ย
ราคาต่ำสุด (highlight สีเขียว)
ราคาสูงสุด (highlight สีแดง)


สามารถ export ตารางนี้เป็น Excel ได้



กราฟเปรียบเทียบราคา

เลือกสินค้าที่ต้องการดู
แสดง Multi-Line Chart เปรียบเทียบราคา 12 เดือนย้อนหลัง
แต่ละเส้นแทน Supplier แต่ละราย (สีต่างกัน)
แกน X: เดือน-ปี
แกน Y: ราคา
Legend แสดงชื่อ Supplier
แสดงเปอร์เซ็นต์ส่วนต่างราคา



ตารางประวัติการซื้อ (Purchase History)

บันทึกว่าซื้อจาก Supplier ไหน วันที่ไหน ราคาเท่าไหร่
เชื่อมโยงกับสินค้าในกลุ่ม
ใช้วิเคราะห์แนวโน้มการซื้อ


2.5 รายงานและกราฟเพิ่มเติม

กราฟแนวโน้มราคาเฉลี่ย แต่ละ Category
Top 10 สินค้าที่มีความผันผวนของราคาสูง
Supplier Performance Report:

ความถี่ในการอัพเดตราคา
จำนวนครั้งที่ถูกเลือกซื้อ (ถ้ามีข้อมูล Purchase History)
ราคาเฉลี่ยเทียบกับตลาด


Export รายงานเป็น Excel/PDF
3. ระบบ Admin Portal (User Role: Admin)3.1 การจัดการผู้ใช้งาน (User Management)
ฟีเจอร์:

ตารางแสดง User ทั้งหมด

คอลัมน์: Username, Full Name, Email, Role, Status, Last Login, Created Date



เพิ่ม User ใหม่

กรอกข้อมูล:

Username (ห้ามซ้ำ)
Password (ต้อง hash ก่อนบันทึก)
Full Name
Email
Role: Supplier / Buyer / Admin
Status: Active / Inactive
หาก Role = Supplier: เลือก Supplier Company จาก dropdown





แก้ไข User

แก้ไขข้อมูลทั่วไป
Reset Password
เปลี่ยน Role
เปลี่ยน Status



ลบ User

Soft delete (เปลี่ยนสถานะเป็น Deleted)
แสดง confirmation ก่อนลบ


3.2 การจัดการสิทธิ์ (Permission Management)
Role-Based Access Control:

Admin: ทำได้ทุกอย่าง
Buyer:

ดูข้อมูลทุก Supplier
จัดกลุ่มสินค้า
ดูรายงาน
ไม่สามารถแก้ไขราคาของ Supplier


Supplier:

ดูและแก้ไขเฉพาะสินค้าของตัวเอง
Upload ราคา
ไม่เห็นข้อมูล Supplier อื่น


3.3 การจัดการข้อมูลสินค้า Master

แก้ไข Master Product ได้ทั้งหมด
Upload/ลบรูปภาพสินค้า (เก็บใน folder /uploads/products/)
แก้ไข Category
ดู Log การเปลี่ยนแปลงข้อมูล
3.4 การจัดการ Supplier Company

เพิ่ม/แก้ไข/ลบ Supplier Company
ข้อมูล:

Supplier Code
Company Name
Address
Contact Person
Tel, Email
Tax ID
Status


3.5 Export ข้อมูล
ฟีเจอร์:

Export Database เป็น SQL

Backup ฐานข้อมูลทั้งหมดเป็นไฟล์ .sql
ระบุวันที่ในชื่อไฟล์ (เช่น backup_2025-01-31.sql)



Export ข้อมูลเป็น Excel

Export ตารางแต่ละตารางออกมาเป็น sheet ต่างๆ
เลือก Export ได้ทั้งหมด หรือ เลือก table ที่ต้องการ


3.6 System Logs และ Audit Trail

Log การ Login/Logout
Log การเปลี่ยนแปลงข้อมูลสำคัญ (Who, What, When)
แสดงในตาราง สามารถกรอง filter ตามวันที่, User, Action