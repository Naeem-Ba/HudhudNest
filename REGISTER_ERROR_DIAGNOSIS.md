# 🔍 دليل تشخيص خطأ التسجيل

**الخطأ:** `An error occurred while saving the entity changes. See the inner exception for details.`

**النوع:** خطأ من الخلفية (Backend - C#)

**الخطورة:** 🔴 حرجة

---

## 📋 **الخطوات السريعة للتشخيص**

### **الخطوة 1️⃣: افتح Network Tab**

```
1. افتح متصفحك (Chrome / Firefox / Edge)
2. اضغط F12 → اختر "Network" tab
3. امسح الطلبات السابقة (Clear)
4. حاول تسجيل حساب جديد
5. ابحث عن POST request إلى: /api/auth/register
6. اضغط عليها وانظر إلى:
   - Response tab
   - اقرأ الخطأ الكامل
```

### **الخطوة 2️⃣: افحص الخطأ الكامل**

الخطأ قد يكون مثل:

```json
{
  "message": "An error occurred while saving the entity changes. See the inner exception for details.",
  "error": {
    "message": "The error details...",
    "innerException": {
      "message": "Could not insert duplicate key row in object 'dbo.Users'...",
      ...
    }
  }
}
```

**ابحث عن:** `innerException.message` - هذا يحتوي على السبب الفعلي

---

## 🎯 **الأسباب الشائعة والحلول**

### **❌ السبب 1: البريد الإلكتروني مسجل بالفعل**

**الرسالة:**
```
Violation of PRIMARY KEY or UNIQUE KEY constraint 'UX_ApplicationUser_Email'
```

**الحل:**
```
1. استخدم بريد إلكتروني مختلف
2. تحقق من قاعدة البيانات إذا كان البريد موجود
3. تأكد من أن البريد محذوف من سلة المحذوفات
```

---

### **❌ السبب 2: فشل التحقق من صحة البيانات**

**الرسالة:**
```
Value "password123" violates the check constraint 'CK_User_Password_Policy'
```

**الحل:**
```
1. تأكد من أن كلمة المرور تستوفي المتطلبات:
   ✓ 8 أحرف على الأقل
   ✓ حرف كبير واحد (A-Z)
   ✓ حرف صغير واحد (a-z)
   ✓ رقم واحد (0-9)
   ✓ حرف خاص (!@#$%^&*)
   
2. مثال كلمة مرور صحيحة: "SecurePass123!"
```

---

### **❌ السبب 3: مشكلة في الاتصال بقاعدة البيانات**

**الرسالة:**
```
Cannot open database "PropertyDb" requested by the login...
A network-related or instance-specific error occurred while establishing a connection to SQL Server
```

**الحل:**
```
1. تأكد من أن SQL Server قيد التشغيل
2. تحقق من connection string في appsettings.json
3. تأكد من أن كلمة مرور قاعدة البيانات صحيحة
4. تحقق من أن اسم الخادم صحيح

# في Windows:
services.msc → ابحث عن SQL Server → تأكد من حالة "Running"
```

---

### **❌ السبب 4: حقول مطلوبة ناقصة**

**الرسالة:**
```
Cannot insert NULL into column 'FirstName' in table 'dbo.Users'
```

**الحل:**
```
1. تحقق من أن جميع الحقول المطلوبة مملوءة:
   ✓ firstName (الاسم الأول)
   ✓ lastName (الاسم الأخير)
   ✓ email (البريد)
   ✓ password (كلمة المرور)
   
2. تأكد من عدم وجود مسافات فقط
```

---

### **❌ السبب 5: مشكلة في منطق الخلفية**

**الرسالة:**
```
Object reference not set to an instance of an object (NullReferenceException)
```

**الحل:**
```
1. هذا خطأ برمجي في الخلفية
2. تحقق من logs الخادم:
   Windows: Event Viewer
   Linux: /var/log/application.log
   
3. ابحث عن stack trace الكامل
```

---

## 🛠️ **خطوات التشخيص المفصلة**

### **على Windows:**

```powershell
# 1. افتح PowerShell كـ Administrator

# 2. تحقق من SQL Server
Get-Service MSSQLSERVER | Select-Object Status

# يجب أن ترى: Status = Running

# 3. إذا كان متوقفاً، شغّله
Start-Service MSSQLSERVER

# 4. تحقق من الاتصال
sqlcmd -S localhost -U sa -P YourPassword

# يجب أن ترى: 1>
# اكتب: exit
```

### **على Linux/Mac:**

```bash
# 1. تحقق من اتصال قاعدة البيانات
docker ps | grep sql

# 2. اعرض logs الحاوية
docker logs <container-id>

# 3. تحقق من appsettings.json
cat appsettings.json | grep -A 5 "ConnectionStrings"
```

---

## 📊 **جدول الأخطاء الشامل**

| الخطأ | السبب | الحل |
|------|------|------|
| Duplicate key | بريد مسجل | استخدم بريد جديد |
| Check constraint | كلمة ضعيفة | اتبع المتطلبات |
| Cannot connect | DB معطل | شغّل SQL Server |
| NULL column | حقل ناقص | ملأ جميع الحقول |
| NullReferenceException | خطأ برمجي | افحص logs الخادم |
| Timeout | بطء | زد timeout في config |

---

## 🔧 **الحل السريع (نسخ-لصق)**

### **1. تحقق من البيانات المرسلة:**

```typescript
// في Browser Console
const data = {
  firstName: "John",
  lastName: "Doe",
  email: "john@example.com",
  password: "SecurePass123!"
};

// تأكد من:
console.log(Object.values(data).every(v => v && v.trim()));
// يجب أن يطبع: true
```

### **2. تحقق من الاستجابة الكاملة:**

```javascript
// في Browser Console بعد محاولة التسجيل الفاشلة

// فتح Network tab
// اضغط على طلب POST /api/auth/register
// اذهب إلى Response tab
// انسخ الجواب الكامل

// مثال:
{
  "message": "An error occurred while saving the entity changes. See the inner exception for details.",
  "errors": {
    "email": ["An error occurred while saving the entity changes. See the inner exception for details."]
  }
}
```

---

## 🚀 **الحل الشامل - خطوة بخطوة**

### **أ) تحقق من الخلفية أولاً:**

```csharp
// في RegisterCommandHandler.cs
// أضف logging تفصيلي

try
{
    // ...
    await _unitOfWork.SaveChangesAsync(ct);
}
catch (DbUpdateException ex)
{
    _logger.LogError(ex, "Database error during registration");
    _logger.LogError("Inner Exception: {InnerException}", ex.InnerException?.Message);
    throw;
}
```

### **ب) افحص appsettings.json:**

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=localhost;Database=PropertyDb;User Id=sa;Password=YourPassword;Encrypt=false;TrustServerCertificate=true;"
  }
}
```

### **ج) تحقق من Entity Configuration:**

```csharp
// في ApplicationUser.cs
public class ApplicationUser : IdentityUser
{
    // تأكد من أن جميع الحقول مُعرّفة بشكل صحيح
    [Required]
    [MaxLength(100)]
    public string FirstName { get; set; }

    [Required]
    [MaxLength(100)]
    public string LastName { get; set; }

    // تأكد من أن constraints صحيح
}
```

---

## 📝 **نموذج الإبلاغ عن الخطأ**

إذا استمرت المشكلة، أبلغ بالمعلومات التالية:

```
❌ الخطأ الذي تراه:
[ألصق الخطأ الكامل من Response]

📍 المكان:
- صفحة: [تسجيل البريد / OTP / الهاتف]
- الخطوة: [أدخل البيانات / اضغط زر / انتظر]

📊 البيانات المرسلة:
- FirstName: ________
- LastName: ________
- Email: ________
- Password: ________

🖥️ البيئة:
- نظام التشغيل: Windows / Linux / Mac
- المتصفح: Chrome / Firefox / Safari
- الإصدار: ________

🔗 Network Response:
[انسخ الاستجابة الكاملة من Response tab]

📋 Server Logs:
[افحص Application logs وانسخ الأخطاء ذات الصلة]
```

---

## ✅ **قائمة الفحص النهائية**

- [ ] فتحت Network tab وفحصت Response
- [ ] اقرأت `innerException.message` الفعلي
- [ ] تحققت من أن كلمة المرور تستوفي المتطلبات
- [ ] تحققت من أن البريد لم يُسجل بالفعل
- [ ] تأكدت من تشغيل SQL Server
- [ ] فحصت connection string في appsettings.json
- [ ] اطلعت على logs الخادم
- [ ] حاولت مع بيانات جديدة مختلفة تماماً

---

## 📞 **إذا لم ينجح أي شيء**

أرسل:
1. لقطة شاشة من Network Response (الخطأ الكامل)
2. نسخة من `appsettings.json` (بدون كلمات المرور)
3. نسخة من Application Logs
4. إصدار .NET المستخدم
5. إصدار SQL Server

