# بناء تطبيق iOS

## بناء يومي

```bash
npm install
npm run build:prod
npx cap sync ios
npx cap open ios
```

في Xcode اختر Simulator أو iPhone فعلي ثم Product > Build.

## بناء جهاز فعلي

- فعّل Developer Mode على iPhone.
- صِل الجهاز بالـMac ووثّق الثقة.
- اختر Development Team.
- تحقق من أن Bundle Identifier فريد.
- شغّل التطبيق وراجع Console للأخطاء.

## Archive

من Xcode:

1. اختر `Any iOS Device (arm64)`.
2. Product > Archive.
3. نفّذ Validate App.
4. عالج كل أخطاء التوقيع والخصوصية قبل Distribute App.

لا يعتبر نجاح `ng build` دليلاً على نجاح Xcode Archive؛ كلاهما بوابتان منفصلتان.
