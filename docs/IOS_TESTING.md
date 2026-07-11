# قائمة اختبار iOS

## الأجهزة والعروض

اختبر على جهاز حقيقي ذي notch أو Dynamic Island، ويفضل أيضاً شاشة صغيرة مثل iPhone SE عبر Simulator.

## الفحوص الإلزامية

- Navbar لا يدخل تحت Status Bar أو Dynamic Island.
- Mobile Drawer يحترم Safe Area أعلى وأسفل.
- Home Indicator لا يغطي الأزرار الثابتة.
- Portrait وLandscape لا ينتجان تمريراً أفقياً.
- فتح الكيبورد لا يخفي الحقل النشط أو أزرار الحفظ.
- الحقول بحجم خط 16px على الهاتف ولا يحدث Safari auto-zoom.
- Login/Register، قائمة العقارات، التفاصيل، إضافة عقار، رفع الصور، Profile، Favorites، Notifications.
- الصور وCloudinary على Wi-Fi وشبكة بطيئة.
- Offline/عودة الاتصال.
- Light Mode وDark Mode إن كانا مدعومين.
- روابط خارجية، الخرائط، ورفع الملفات.
- العودة من الخلفية واستعادة الجلسة.

وثّق: الموديل، إصدار iOS، نسخة التطبيق أو commit، الاتجاه، النتيجة، ولقطة شاشة أو فيديو للأعطال.
