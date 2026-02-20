# 🚀 คู่มือ Deploy ขึ้น Render.com

## ขั้นตอนที่ 1: สมัคร Cloudinary (เก็บรูปฟรี)

1. ไปที่ https://cloudinary.com/users/register_free
2. สมัครด้วย Email หรือ Google (ไม่ผูกบัตร)
3. หลังสมัคร → ไปที่ **Dashboard**
4. คัดลอก **CLOUDINARY_URL** (ขึ้นต้นด้วย `cloudinary://...`)
5. เก็บไว้ใช้ในขั้นตอนที่ 4

---

## ขั้นตอนที่ 2: Push โค้ดขึ้น GitHub

```bash
# 1. เข้าโฟลเดอร์โปรเจค
cd /Users/teejakkrit/Downloads/plan2

# 2. สร้าง Git repo
git init
git add .
git commit -m "Initial: Supplier Price Comparison System"

# 3. สร้าง repo ใหม่บน GitHub (ไปที่ github.com/new)
#    ใส่ชื่อ repo แล้วกด Create

# 4. เชื่อมและ push
git remote add origin https://github.com/USERNAME/REPO_NAME.git
git branch -M main
git push -u origin main
```

> ⚠️ เปลี่ยน `USERNAME` และ `REPO_NAME` ให้ตรงกับของคุณ

---

## ขั้นตอนที่ 3: สร้าง Database บน Render

1. ไปที่ https://render.com (สมัครด้วย GitHub - ไม่ผูกบัตร)
2. กด **New** → **PostgreSQL**
3. ตั้งค่า:
   - **Name:** `price-compare-db`
   - **Region:** Singapore (ใกล้ไทย)
   - **Plan:** **Free**
4. กด **Create Database**
5. รอสร้างเสร็จ → คัดลอก **Internal Database URL**

---

## ขั้นตอนที่ 4: สร้าง Web Service บน Render

1. กด **New** → **Web Service**
2. เลือก **Build and deploy from a Git repository**
3. เชื่อม GitHub repo ที่สร้างในขั้นตอนที่ 2
4. ตั้งค่า:
   - **Name:** `price-compare` (จะได้ URL: `price-compare.onrender.com`)
   - **Region:** Singapore
   - **Branch:** `main`
   - **Root Directory:** (ว่างไว้)
   - **Runtime:** Node
   - **Build Command:** `cd backend && npm install`
   - **Start Command:** `cd backend && node server.js`
   - **Plan:** **Free**

5. เพิ่ม **Environment Variables** (กด **Add Environment Variable**):

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | (วาง Internal Database URL จากขั้นตอนที่ 3) |
| `SESSION_SECRET` | (กด Generate เพื่อสร้างค่า random) |
| `CLOUDINARY_URL` | (วาง URL จากขั้นตอนที่ 1) |

6. กด **Create Web Service**
7. รอ Build + Deploy (~3-5 นาที)

---

## ขั้นตอนที่ 5: ทดสอบ

1. เปิด URL: `https://price-compare.onrender.com`
2. Login ด้วย:
   - **Admin:** `admin_master` / `Tiger79Moon`
   - **Buyer:** `buyer_ops` / `River48Star`
   - **Supplier:** `supplier_primary` / `Stone63Sky`

---

## 📦 อัพเดทระบบ (ทุกครั้งที่แก้โค้ด)

```bash
git add .
git commit -m "อธิบายการแก้ไข"
git push origin main
```

Render จะ **Auto Deploy** ให้ทันทีเมื่อ push! 🎉

---

## ⚠️ หมายเหตุ

- **Free Plan** จะ sleep หลัง 15 นาทีไม่มีคนใช้ → ตื่นเองเมื่อมีคนเข้า (ช้า ~30 วินาที)
- **PostgreSQL Free** ใช้ได้ 90 วัน → หมดแล้วสร้างใหม่ได้ หรืออัพเป็น Starter ($7/เดือน)
- **Cloudinary Free** เก็บรูปได้ 25GB
- ทดสอบ **localhost** ได้เสมอด้วย `cd backend && node server.js` (ใช้ SQLite อัตโนมัติ)
