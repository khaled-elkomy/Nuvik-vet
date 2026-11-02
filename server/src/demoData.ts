import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Server as HttpServer } from 'node:http';
import { pathToFileURL } from 'node:url';

type SeedUser = { role: string; name: string; email: string; password: string };
const DEMO_DB = 'nuvik_demo';
const DEMO_CLINIC = 'Nuvik Demo Clinic';

function guardedDatabaseUrl(): URL {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is required and must target nuvik_demo');
  const url = new URL(raw);
  if (url.pathname.replace(/^\//, '') !== DEMO_DB) throw new Error('Demo seed refused: DATABASE_URL database name must be exactly nuvik_demo');
  return url;
}

async function resetDemoDatabase(url: URL) {
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const { Pool } = await import('pg');
  const maintenance = new Pool({ connectionString: adminUrl.toString() });
  try {
    await maintenance.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()`, [DEMO_DB]);
    await maintenance.query(`DROP DATABASE IF EXISTS nuvik_demo`);
    const owner = url.username.replaceAll('"', '""');
    await maintenance.query(`CREATE DATABASE nuvik_demo OWNER "${owner}"`);
  } finally { await maintenance.end(); }

  const root = path.resolve(process.cwd(), '..');
  const docker = process.env.NUVIK_DOCKER_PATH ?? 'C:\\Users\\khale\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe';
  const migrationPath = path.join(root, 'db', 'migrations');
  const args = [
    'run', '--rm', '--name', 'nuvik-dev-flyway', '--network', 'nuvik-dev-net',
    '--mount', `type=bind,source=${migrationPath},target=/flyway/sql,readonly`,
    'flyway/flyway:13.11.1',
    `-url=jdbc:postgresql://nuvik-dev-postgres:5432/${DEMO_DB}`,
    `-user=${decodeURIComponent(url.username)}`,
    `-password=${decodeURIComponent(url.password)}`,
    '-locations=filesystem:/flyway/sql', 'migrate',
  ];
  try { execFileSync(docker, args, { stdio: 'ignore', windowsHide: true }); }
  catch { throw new Error('Demo database was recreated, but Flyway migration failed; rerun Flyway before seeding.'); }
}

function ean13(sequence: number): string {
  const firstTwelve = `2${String(sequence).padStart(11, '0')}`;
  const sum = [...firstTwelve].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return `${firstTwelve}${(10 - (sum % 10)) % 10}`;
}

function moneyFromCents(cents: number): string { return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`; }

async function main(args = process.argv.slice(2)) {
  const url = guardedDatabaseUrl();
  if (args.includes('--reset')) await resetDemoDatabase(url);
  const [{ pool }, { runBootstrap }, { createApp }] = await Promise.all([
    import('./db.js'), import('./bootstrap.js'), import('./app.js'),
  ]);
  const exists = await pool.query(`SELECT 1 FROM clinics LIMIT 1`);
  if (exists.rows.length) {
    await pool.end();
    throw new Error(`Demo seed refused: ${DEMO_DB} already contains clinic data. Pass --reset to recreate only ${DEMO_DB}.`);
  }

  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  const users: SeedUser[] = [
    { role: 'admin', name: 'مدير العرض', email: 'admin@nuvik-demo.local', password: '' },
    { role: 'reception_cashier', name: 'موظف الاستقبال', email: 'cashier@nuvik-demo.local', password: randomBytes(24).toString('base64url') },
    { role: 'vet', name: 'طبيب بيطري', email: 'vet@nuvik-demo.local', password: randomBytes(24).toString('base64url') },
    { role: 'store_keeper', name: 'مسؤول المتجر', email: 'store@nuvik-demo.local', password: randomBytes(24).toString('base64url') },
  ];
  const credentialsPath = path.resolve(process.cwd(), '..', '.local', 'demo-credentials.txt');
  const writeCredentials = async () => {
    await mkdir(path.dirname(credentialsPath), { recursive: true });
    const text = ['Nuvik Vet demo credentials — keep this ignored local file private.', ...users.map((user) => `${user.role}\t${user.email}\t${user.password}`)].join('\n') + '\n';
    await writeFile(credentialsPath, text, { mode: 0o600 });
  };

  let server: HttpServer | undefined;
  try {
    await runBootstrap([
      '--clinic-code', `nuvik-demo-${suffix}`, '--clinic-name', DEMO_CLINIC,
      '--branch-code', 'main', '--branch-name', 'الفرع الرئيسي',
      '--admin-email', users[0].email, '--admin-name', users[0].name,
    ]);
    const bootstrapFile = path.resolve(process.cwd(), '..', '.local', 'bootstrap-credentials.txt');
    const bootstrapText = await readFile(bootstrapFile, 'utf8');
    users[0].password = bootstrapText.match(/^Admin password: (.+)$/m)?.[1] ?? '';
    if (!users[0].password) throw new Error('Bootstrap did not generate the demo administrator credential');
    await writeCredentials();

    const app = createApp();
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => { server!.once('listening', resolve); server!.once('error', reject); });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Could not open the local demo seed API');
    const base = `http://127.0.0.1:${address.port}/api`;
    const request = async (endpoint: string, options: RequestInit = {}, token?: string) => {
      const response = await fetch(`${base}${endpoint}`, {
        ...options,
        headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${endpoint} failed (${response.status}): ${body?.error ?? 'request failed'}`);
      return body;
    };
    const login = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email: users[0].email, password: users[0].password }) });
    const token = login.token as string;
    for (const user of users.slice(1)) {
      const created = await request('/users', { method: 'POST', body: JSON.stringify({ displayName: user.name, email: user.email, password: user.password }) }, token);
      await request(`/users/${created.id}/roles`, { method: 'POST', body: JSON.stringify({ roleCode: user.role }) }, token);
    }

    const speciesInputs = [
      { code: 'dog', label: 'كلب', breeds: ['هاسكي', 'لولو', 'جيرمن شيبرد'] },
      { code: 'cat', label: 'قط', breeds: ['شيرازي', 'بلدي', 'سيامي'] },
      { code: 'bird', label: 'طائر', breeds: ['بادجي', 'كناري', 'كوكتيل'] },
      { code: 'rabbit', label: 'أرنب', breeds: ['هولندي', 'أنجورا', 'قزم'] },
    ];
    const species: Array<{ id: string; label: string; breeds: Array<{ id: string; label: string }> }> = [];
    for (const input of speciesInputs) {
      const row = await request('/species', { method: 'POST', body: JSON.stringify({ code: input.code, label: input.label }) }, token);
      const breeds = [];
      for (const [index, label] of input.breeds.entries()) breeds.push(await request(`/species/${row.id}/breeds`, { method: 'POST', body: JSON.stringify({ code: `${input.code}-${index + 1}`, label }) }, token));
      species.push({ ...row, breeds });
    }

    const customers = [];
    for (let index = 1; index <= 8; index++) customers.push(await request('/customers', {
      method: 'POST', body: JSON.stringify({ name: `عميل تجريبي ${String(index).padStart(2, '0')}`, phone: `0100000${String(index).padStart(4, '0')}`, email: `demo-customer-${index}@example.invalid`, notes: 'بيانات تجريبية غير حقيقية' }),
    }, token));

    const animalNames = ['بندق','لوز','سمسم','مشمش','فلفل','توت','زغلول','لولو','قمر','بسبوس','مشمش الصغير','رومي'];
    for (let index = 0; index < animalNames.length; index++) {
      const type = species[index % species.length];
      await request('/animals', { method: 'POST', body: JSON.stringify({
        name: animalNames[index], speciesId: type.id, breedId: type.breeds[index % type.breeds.length].id,
        ownerCustomerId: customers[index % customers.length].id, sex: ['male', 'female', 'unknown'][index % 3],
        ageYears: 1 + (index % 7), ageMonths: index % 12, notes: 'سجل حيوان تجريبي للعرض فقط',
      }) }, token);
    }

    const productSpecs: Array<{ code: string; name: string; category: string; variants: Array<{ label: string; unit: string; price: string; cost: string; stock: string }> }> = [];
    const foods = ['طعام جاف للقطط بالدجاج','طعام جاف للقطط بالسمك','طعام للكلاب الصغيرة','طعام للكلاب البالغة','طعام للجراء','طعام للقطط الصغيرة','طعام للطيور','طعام للأرانب','طعام رطب للقطط','طعام رطب للكلاب'];
    foods.forEach((name,index) => productSpecs.push({ code:`FOOD-${String(index+1).padStart(2,'0')}`,name,category:'أغذية الحيوانات',variants:[{label:'عبوة 1 كجم',unit:'كجم',price:`${100+index*5}.00`,cost:`${70+index*3}.00`,stock:index===2?'3.000':'40.000'},{label:'عبوة 5 كجم',unit:'كجم',price:`${450+index*20}.00`,cost:`${330+index*12}.00`,stock:'24.000'}] }));
    ['كرة مطاطية','حبل لعب','فأر قطط قماشي','عصا ريش','جرس للحيوانات','لعبة مضغ','نفق لعب للقطط','عظمة لعب'].forEach((name,index) => productSpecs.push({ code:`TOY-${String(index+1).padStart(2,'0')}`,name,category:'ألعاب',variants:[{label:'قطعة',unit:'قطعة',price:`${45+index*8}.00`,cost:`${25+index*5}.00`,stock:index===3?'2.000':'35.000'}] }));
    ['طوق صغير','طوق كبير','مقود','وعاء طعام','وعاء ماء','فرشاة تمشيط','حامل نقل','صندوق فضلات'].forEach((name,index) => productSpecs.push({ code:`ACC-${String(index+1).padStart(2,'0')}`,name,category:'مستلزمات',variants:[{label:'قطعة',unit:'قطعة',price:`${70+index*15}.00`,cost:`${42+index*9}.00`,stock:'22.000'}] }));
    ['مطهر جروح بيطري','شامبو بيطري','قطرة أذن بيطرية','محلول عناية بالعين','مكمل غذائي للحيوانات','بودرة مكافحة البراغيث','معجون كرات الشعر','محلول أملاح بيطري','كريم عناية بالجلد','فيتامينات للطيور'].forEach((name,index) => productSpecs.push({ code:`MED-${String(index+1).padStart(2,'0')}`,name,category:'مستلزمات بيطرية',variants:[{label:'عبوة',unit:'عبوة',price:`${85+index*12}.00`,cost:`${52+index*7}.00`,stock:index===5?'3.000':'18.000'}] }));

    const allVariants: Array<{ id: string; price: string; productName: string }> = [];
    let barcodeSequence = 1;
    for (const [index, spec] of productSpecs.entries()) {
      let variantSequence = allVariants.length;
      const variants = spec.variants.map((variant) => {
        const variantIndex = variantSequence++;
        const barcodes = variantIndex < 30 ? [ean13(barcodeSequence++)] : [];
        return { sku: `${spec.code}-${String(variantIndex + 1).padStart(2, '0')}`, name: variant.label, unit: variant.unit, price: variant.price, cost: variant.cost, barcodes, stock: variant.stock };
      });
      const created = await request('/products', { method: 'POST', body: JSON.stringify({ code: spec.code, name: spec.name, category: spec.category, variants: variants.map(({ stock: _stock, ...variant }) => variant) }) }, token);
      for (let variantIndex = 0; variantIndex < created.variants.length; variantIndex++) {
        const variant = created.variants[variantIndex];
        allVariants.push({ id: variant.id, price: variant.price, productName: spec.name });
        await request(`/products/${variant.id}/opening-stock`, { method: 'POST', body: JSON.stringify({ quantity: variants[variantIndex].stock }) }, token);
      }
    }

    const services = [];
    for (const [index, service] of [
      { code:'SERVICE-CONSULT', name:'كشف بيطري', price:'180.00' },
      { code:'SERVICE-VAX', name:'خدمة تطعيم', price:'120.00' },
      { code:'SERVICE-GROOM', name:'تنظيف وتمشيط', price:'150.00' },
      { code:'SERVICE-NAIL', name:'قص أظافر', price:'60.00' },
    ].entries()) services.push(await request('/products', { method:'POST', body:JSON.stringify({ ...service, category:'خدمات', isService:true, defaultUnitPrice:service.price, variants:[] }) }, token));

    const sale = async (customerId: string, lines: Array<{ variantId?: string; serviceProductId?: string; quantity: string }>, payments: Array<{ method: string; amount: string }>) => request('/pos/sales', {
      method:'POST', headers:{ 'Idempotency-Key':`demo-seed-${randomUUID()}` }, body:JSON.stringify({ customerId,lines,payments }),
    }, token);
    const [food1, food2, toy1, accessory1, medicine1, food5kg] = [allVariants[0],allVariants[2],allVariants[20],allVariants[28],allVariants[36],allVariants[1]];
    const asInt = (price: string) => Math.round(Number(price) * 100);
    const invoice1 = await sale(customers[0].id,[{variantId:food1.id,quantity:'1.000'}],[{method:'card',amount:food1.price}]);
    const splitTotal = asInt(food2.price) + asInt(toy1.price);
    const invoice2 = await sale(customers[1].id,[{variantId:food2.id,quantity:'1.000'},{variantId:toy1.id,quantity:'1.000'}],[{method:'card',amount:(splitTotal/2/100).toFixed(2)},{method:'wallet',amount:(splitTotal/2/100).toFixed(2)}]);
    const creditTotal = asInt(food1.price) * 2;
    const credit = await sale(customers[2].id,[{variantId:food1.id,quantity:'2.000'}],[]);
    await sale(customers[3].id,[{serviceProductId:services[0].id,quantity:'1.000'}],[{method:'card',amount:services[0].defaultUnitPrice}]);
    await sale(customers[4].id,[{variantId:food5kg.id,quantity:'1.000'}],[{method:'wallet',amount:food5kg.price}]);
    await sale(customers[5].id,[{variantId:accessory1.id,quantity:'1.000'},{variantId:medicine1.id,quantity:'1.000'}],[{method:'card',amount:moneyFromCents(asInt(accessory1.price)+asInt(medicine1.price))}]);
    const creditCustomer = customers[2];
    await request(`/customers/${creditCustomer.id}/receive-payment`,{ method:'POST',headers:{ 'Idempotency-Key':`demo-credit-payment-${randomUUID()}` },body:JSON.stringify({amount:(creditTotal/4/100).toFixed(2),method:'wallet'}) },token);

    const allProducts = productSpecs.length + services.length;
    const barcodeCount = barcodeSequence - 1;
    await writeCredentials();
    console.log(`Demo seed complete: ${allProducts} products/services, ${allVariants.length} variants, ${barcodeCount} EAN-13 barcodes, ${customers.length} customers, ${animalNames.length} animals, 6 sales; one credit balance remains open.`);
    console.log(`Local credentials written to ${credentialsPath}; values were not displayed.`);
    void invoice1; void invoice2; void credit;
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : 'Demo seed failed'); process.exitCode = 1; });
}
