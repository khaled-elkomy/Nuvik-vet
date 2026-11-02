# Nuvik Vet demo

The demo uses the isolated `nuvik_demo` database in the local PostgreSQL 16 container. The app launcher switches the API connection to this database only; `nuvik_dev` remains separate and unchanged. The database container is published only on `127.0.0.1:55432`.

## Start the demo

Create the database with Flyway and load clearly fake sample data with:

```powershell
powershell -ExecutionPolicy Bypass -File .\demo-seed.ps1
```

To recreate only `nuvik_demo` and reseed it:

```powershell
powershell -ExecutionPolicy Bypass -File .\demo-seed.ps1 -Reset
```

Start the API and Vite, and wait for their health checks:

```powershell
powershell -ExecutionPolicy Bypass -File .\demo-start.ps1
```

Open <http://127.0.0.1:5178>. The demo users and generated passwords are in the ignored local file `.local/demo-credentials.txt`; keep it private. No credential values are displayed by the scripts.

## Demo users

| Account | Role | Demonstration focus |
|---|---|---|
| `admin@nuvik-demo.local` | Admin | All implemented pages and administration |
| `cashier@nuvik-demo.local` | Reception/cashier | Customers, POS, invoices, and own shifts |
| `vet@nuvik-demo.local` | Vet | Customer and animal records; clinical features are upcoming |
| `store@nuvik-demo.local` | Store keeper | Catalog and inventory reading |

## Ten-minute click-through

1. **تسجيل الدخول — دقيقة:** سجّل الدخول بحساب الاستقبال والصندوق من ملف بيانات العرض المحلي.
2. **عميل وحيوان — دقيقة ونصف:** افتح «العملاء والحيوانات»، أضف عميلًا تجريبيًا، ثم اختر «إضافة حيوان». اختر النوع والسلالة وأدخل عمرًا تقريبيًا.
3. **صنف بباركود حقيقي — دقيقة ونصف:** افتح «الكتالوج والمخزون»، أضف منتجًا تجريبيًا، وامسح باركود عبوة حقيقية في حقل الباركود. سجّل كمية رصيد افتتاحي، ثم افتح «نقطة البيع» وامسح الباركود نفسه للتحقق من إضافة المنتج إلى السلة.
4. **فتح الوردية وبيع نقدي — دقيقة:** افتح وردية الصندوق من شاشة البيع، ثم أكمل عملية بيع نقدية لمنتج متوفر.
5. **دفع مقسوم — دقيقة:** أضف بندين إلى السلة، وأدخل دفعتين بطريقتين مختلفتين، ثم أكمل البيع.
6. **بيع آجل — دقيقة:** اختر عميلًا، أكمل بيعًا دون دفعة، ثم افتح ملف العميل وتحقق من الرصيد والفاتورة المفتوحة.
7. **استلام دفعة — دقيقة:** من ملف العميل اختر «استلام دفعة» وسجّل مبلغًا أقل من الرصيد المستحق.
8. **الفاتورة — دقيقة:** افتح «الفواتير»، واختر إحدى الفواتير لمراجعة البنود والمدفوع والمتبقي.
9. **إغلاق الوردية — دقيقة:** ارجع إلى «نقطة البيع»، أغلق الوردية، وأدخل النقدية المعدودة.
10. **الورديات — دقيقة:** افتح صفحة «الورديات» وراجع وقت الفتح والإغلاق والمتوقع والمعدود والفرق.

## ما سنعرضه لاحقًا

- سجل الكشف البيطري والاستشارات.
- التطعيمات والتذكير بمواعيدها.
- حجوزات التبييت ورعاية الحيوانات.
- التقارير التشغيلية والمالية.
- المرفقات الطبية مثل التحاليل والأشعة.
- إرسال التذكيرات عبر WhatsApp Business.

## Stop

Close the API and Vite windows when finished. The app launcher records only the PowerShell process IDs it starts in ignored `.local/demo-processes.json`. The PostgreSQL container and `nuvik-dev-pgdata` volume remain available; `nuvik_dev` is not used by the demo.
