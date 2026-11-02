import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, Search, PawPrint, UserRound, Edit2, UserX } from 'lucide-react';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { animalsApi, customersApi, posApi, speciesApi } from '../lib/api';
import { useApp } from '../context/AppContext';

const emptyCustomer = { name: '', phone: '', email: '', address: '', notes: '' };

export default function Customers() {
  const { currentUser, pushToast } = useApp();
  const [rows, setRows] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<any | null>(null);
  const [animal, setAnimal] = useState<any | null>(null);
  const [species, setSpecies] = useState<any[]>([]);
  const [breeds, setBreeds] = useState<any[]>([]);
  const [customerForm, setCustomerForm] = useState(emptyCustomer);
  const blankAnimal = { name: '', speciesId: '', breedId: '', sex: '', dateOfBirth: '', ageYears: '', ageMonths: '', microchip: '', identifier: '', notes: '' };
  const [animalForm, setAnimalForm] = useState(blankAnimal);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [animalOpen, setAnimalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState('0.00');
  const [balanceCurrency, setBalanceCurrency] = useState('');
  const [openInvoices, setOpenInvoices] = useState<any[]>([]);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveForm, setReceiveForm] = useState({ amount: '', method: 'cash' });
  const [customerSaved, setCustomerSaved] = useState(false);
  const canWrite = currentUser?.permissions.includes('customers.animals.manage') ?? false;
  const canManageReference = currentUser?.permissions.includes('settings.manage') ?? false;
  const canReceive = currentUser?.permissions.includes('payments.receive') ?? false;

  const refresh = useCallback(async () => { setRows(await customersApi.list(query)); }, [query]);
  useEffect(() => { refresh().catch((e) => pushToast(e.message, 'error')); }, [refresh, pushToast]);
  useEffect(() => { speciesApi.list().then(setSpecies).catch((e) => pushToast(e.message, 'error')); }, [pushToast]);
  useEffect(() => { if (animalForm.speciesId) speciesApi.breeds(animalForm.speciesId).then(setBreeds).catch((e) => pushToast(e.message, 'error')); else setBreeds([]); }, [animalForm.speciesId, pushToast]);
  useEffect(() => { if (selected?.id && canReceive) Promise.all([posApi.balance(selected.id), posApi.openInvoices(selected.id)]).then(([b, invoices]) => { setBalance(b.balance); setBalanceCurrency(b.currency); setOpenInvoices(invoices); }).catch((e) => pushToast(e.message, 'error')); }, [selected?.id, canReceive, pushToast]);

  async function openCustomer(id: string) {
    try { setSelected(await customersApi.get(id)); setAnimal(null); }
    catch (e) { pushToast((e as Error).message, 'error'); }
  }
  async function saveCustomer(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const saved = editingCustomer && selected ? await customersApi.update(selected.id, customerForm) : await customersApi.create(customerForm);
      setCustomerOpen(false); setCustomerForm(emptyCustomer); setEditingCustomer(false); await refresh(); setSelected(await customersApi.get(saved.id));
      setCustomerSaved(!editingCustomer);
      pushToast(editingCustomer ? 'تم تحديث بيانات العميل' : 'تمت إضافة العميل');
    } catch (e) { pushToast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function deactivateCustomer() {
    if (!selected || !window.confirm('إيقاف هذا العميل؟ ستبقى سجلاته محفوظة.')) return;
    try { await customersApi.deactivate(selected.id); setSelected(null); await refresh(); pushToast('تم إيقاف العميل'); } catch (e) { pushToast((e as Error).message, 'error'); }
  }
  async function receivePayment(event: FormEvent) {
    event.preventDefault(); if (!selected) return; setBusy(true);
    try { await posApi.receivePayment(selected.id, receiveForm, crypto.randomUUID()); setReceiveOpen(false); setReceiveForm({ amount: '', method: 'cash' }); const [b, invoices] = await Promise.all([posApi.balance(selected.id), posApi.openInvoices(selected.id)]); setBalance(b.balance); setBalanceCurrency(b.currency); setOpenInvoices(invoices); pushToast('تم تسجيل الدفعة وتوزيعها على الفواتير الأقدم أولًا'); }
    catch (e) { pushToast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function saveAnimal(event: FormEvent) {
    event.preventDefault(); if (!selected) return; setBusy(true);
    try { await animalsApi.create({ ...animalForm, ageYears: animalForm.ageYears || undefined, ageMonths: animalForm.ageMonths || undefined, ownerCustomerId: selected.id }); setAnimalOpen(false); setAnimalForm(blankAnimal); setSelected(await customersApi.get(selected.id)); pushToast('تمت إضافة الحيوان وربطه بالمالك الأساسي'); }
    catch (e) { pushToast((e as Error).message, 'error'); } finally { setBusy(false); }
  }
  async function quickAddSpecies() {
    const label = window.prompt('اسم النوع'); if (!label?.trim()) return;
    const code = window.prompt('رمز النوع (مثل CAT أو DOG)'); if (!code?.trim()) return;
    try { const row = await speciesApi.create({ code, label }); setSpecies((previous) => [...previous, row].sort((a, b) => a.label.localeCompare(b.label))); setAnimalForm((form) => ({ ...form, speciesId: row.id, breedId: '' })); pushToast('تمت إضافة النوع'); }
    catch (e) { pushToast((e as Error).message, 'error'); }
  }
  async function quickAddBreed() {
    if (!animalForm.speciesId) { pushToast('اختر النوع أولًا', 'info'); return; }
    const label = window.prompt('اسم السلالة'); if (!label?.trim()) return;
    const code = window.prompt('رمز السلالة'); if (!code?.trim()) return;
    try { const row = await speciesApi.createBreed(animalForm.speciesId, { code, label }); setBreeds((previous) => [...previous, row]); setAnimalForm((form) => ({ ...form, breedId: row.id })); pushToast('تمت إضافة السلالة'); }
    catch (e) { pushToast((e as Error).message, 'error'); }
  }

  return <Layout title="العملاء والحيوانات">
    <div className="grid xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.4fr)] gap-5" dir="rtl">
      <section className="bg-white rounded-xl2 border border-ink-100 overflow-hidden">
        <div className="p-4 border-b border-ink-100 flex items-center gap-2">
          <div className="relative flex-1"><Search size={17} className="absolute right-3 top-2.5 text-ink-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو الهاتف" className="w-full pr-9 pl-3 py-2 border rounded-lg text-sm" /></div>
          {canWrite && <button onClick={() => { setEditingCustomer(false); setCustomerForm(emptyCustomer); setCustomerOpen(true); }} className="bg-brand-600 text-white rounded-lg px-3 py-2 text-sm inline-flex items-center gap-1"><Plus size={16} />عميل</button>}
        </div>
        <div className="divide-y divide-ink-100 max-h-[70vh] overflow-auto">
          {rows.map((row) => <button key={row.id} onClick={() => openCustomer(row.id)} className={`w-full text-right px-4 py-3 hover:bg-ink-50 ${selected?.id === row.id ? 'bg-brand-50' : ''}`}>
            <span className="block font-semibold text-ink-800">{row.name}</span><span className="block text-xs text-ink-500 mt-1">{row.phone || 'بدون هاتف'}{row.email ? ` · ${row.email}` : ''}</span>
          </button>)}
          {!rows.length && <p className="p-8 text-center text-sm text-ink-400">لا يوجد عملاء مطابقون</p>}
        </div>
      </section>
      <section className="bg-white rounded-xl2 border border-ink-100 p-5 min-h-80">
        {!selected ? <div className="h-full min-h-64 grid place-items-center text-ink-400"><div className="text-center"><UserRound size={32} className="mx-auto mb-2" /><p>اختر عميلًا لعرض بياناته وحيواناته</p></div></div> : <>
          <div className="flex items-start gap-3"><div className="flex-1"><h2 className="text-xl font-bold text-ink-800">{selected.name}</h2><p className="text-sm text-ink-500 mt-1">{selected.phone || 'بدون هاتف'}{selected.email ? ` · ${selected.email}` : ''}</p><p className="text-sm text-ink-500 mt-1">{selected.address || ''}</p></div>
            {canWrite && <div className="flex gap-2"><button onClick={() => { setEditingCustomer(true); setCustomerForm({ name: selected.name, phone: selected.phone || '', email: selected.email || '', address: selected.address || '', notes: selected.notes || '' }); setCustomerOpen(true); }} className="border rounded-lg p-2 text-ink-600" title="تعديل"><Edit2 size={16} /></button><button onClick={deactivateCustomer} className="border rounded-lg p-2 text-red-600" title="إيقاف"><UserX size={16} /></button></div>}
          </div>
          <div className="mt-6 flex items-center justify-between"><h3 className="font-bold text-ink-800 flex items-center gap-2"><PawPrint size={18} />الحيوانات</h3>{canWrite && <button onClick={() => setAnimalOpen(true)} className="bg-brand-600 text-white rounded-lg px-3 py-2 text-sm inline-flex items-center gap-1"><Plus size={16} />حيوان</button>}</div>
          <div className="mt-3 grid md:grid-cols-2 gap-3">{(selected.animals || []).map((item: any) => <button key={item.id} onClick={async () => { try { setAnimal(await animalsApi.get(item.id)); } catch (e) { pushToast((e as Error).message, 'error'); } }} className="text-right border border-ink-100 rounded-xl p-4 hover:border-brand-300"><p className="font-semibold text-ink-800">{item.name}</p><p className="text-sm text-ink-500 mt-1">{item.species}{item.breed ? ` · ${item.breed}` : ''}</p><p className="text-xs text-ink-400 mt-1">{item.sex || 'الجنس غير محدد'}</p></button>)}{!selected.animals?.length && <p className="text-sm text-ink-400 py-6">لا توجد حيوانات مرتبطة بهذا العميل</p>}</div>
          {canReceive && <section className="mt-6 border-t pt-4"><div className="flex items-center justify-between"><div><h3 className="font-bold">الرصيد المستحق</h3><p className="text-lg font-bold text-amber-700 mt-1">{balance} {balanceCurrency}</p></div>{moneyIsPositive(balance) && <button onClick={() => setReceiveOpen(true)} className="bg-brand-600 text-white rounded-lg px-3 py-2 text-sm">استلام دفعة</button>}</div><div className="mt-3 space-y-2">{openInvoices.map((row) => <div key={row.id} className="flex justify-between border rounded-lg px-3 py-2 text-sm"><span>{row.invoiceNumber}</span><span>متبقي {row.remainingAmount} {row.currency}</span></div>)}{!openInvoices.length && <p className="text-xs text-ink-400">لا توجد فواتير مستحقة.</p>}</div></section>}
          {animal && <div className="mt-4 rounded-xl bg-ink-50 p-4"><div className="flex justify-between"><div><h4 className="font-bold">{animal.name}</h4><p className="text-sm text-ink-500">{animal.species}{animal.breed ? ` · ${animal.breed}` : ''} · {sexLabel(animal.sex)}</p><p className="text-sm text-ink-500">{animal.microchip ? `الشريحة: ${animal.microchip}` : ''}</p>{animal.dateOfBirth && <p className="text-sm text-ink-500">العمر: {formatAge(animal.dateOfBirth, animal.birthDateEstimated)}</p>}</div><button onClick={() => setAnimal(null)} className="text-sm text-brand-700">إغلاق</button></div>
            <h5 className="font-semibold mt-4">المالكون</h5><div className="mt-1 space-y-1">{animal.owners?.map((owner: any) => <p key={`${owner.customerId}-${owner.validFrom}`} className="text-sm">{owner.name} {owner.isPrimary ? '· المالك الأساسي' : ''} {owner.validTo ? '· ملكية سابقة' : ''}</p>)}{!animal.owners?.length && <p className="text-sm text-ink-400">لا توجد بيانات مالكين</p>}</div>
            <h5 className="font-semibold mt-4">أحدث فواتير المالك</h5><div className="mt-1 space-y-1">{animal.recentInvoices?.map((invoice: any) => <p key={invoice.id} className="text-sm flex justify-between"><span>{invoice.invoiceNumber} · {invoice.customerName}</span><span>{invoice.total} {invoice.currency}</span></p>)}{!animal.recentInvoices?.length && <p className="text-sm text-ink-400">لا توجد فواتير حديثة</p>}</div>
            <div className="mt-4 grid sm:grid-cols-3 gap-2">{['الكشف','التبييت','التطعيمات'].map((label) => <div key={label} aria-disabled="true" className="border border-dashed rounded-lg p-3 text-center text-ink-400"><p className="font-medium">{label}</p><span className="text-xs">قريبًا</span></div>)}</div>
          </div>}
        </>}
      </section>
    </div>

    <Modal open={customerOpen} onClose={() => setCustomerOpen(false)} title={editingCustomer ? 'تعديل بيانات العميل' : 'إضافة عميل'}>
      <form onSubmit={saveCustomer} className="space-y-3" dir="rtl">{[['name','الاسم'],['phone','الهاتف'],['email','البريد الإلكتروني'],['address','العنوان'],['notes','ملاحظات']].map(([field,label]) => <label key={field} className="block text-sm text-ink-600">{label}<input required={field === 'name'} type={field === 'email' ? 'email' : 'text'} value={(customerForm as any)[field]} onChange={(e) => setCustomerForm((f) => ({ ...f, [field]: e.target.value }))} className="w-full mt-1 border rounded-lg px-3 py-2" /></label>)}<button disabled={busy} className="w-full bg-brand-600 text-white rounded-lg py-2.5">{busy ? 'جارِ الحفظ…' : 'حفظ'}</button></form>
    </Modal>
    <Modal open={customerSaved} onClose={() => setCustomerSaved(false)} title="تم حفظ العميل">
      <div dir="rtl" className="space-y-3"><p className="text-sm text-ink-600">تمت إضافة {selected?.name} بنجاح. هل تريد إضافة حيوان الآن؟</p><button onClick={() => { setCustomerSaved(false); setAnimalForm(blankAnimal); setAnimalOpen(true); }} className="w-full bg-brand-600 text-white rounded-lg py-2.5">إضافة حيوان</button><button onClick={() => setCustomerSaved(false)} className="w-full border rounded-lg py-2.5">إغلاق</button></div>
    </Modal>
    <Modal open={animalOpen} onClose={() => setAnimalOpen(false)} title="إضافة حيوان وربطه بالمالك الأساسي">
      <form onSubmit={saveAnimal} className="space-y-3" dir="rtl">
        <Field label="اسم الحيوان" value={animalForm.name} onChange={(v) => setAnimalForm((f) => ({ ...f, name: v }))} required />
        <label className="block text-sm text-ink-600">النوع<select required onInvalid={(e) => e.currentTarget.setCustomValidity('اختر النوع')} onChange={(e) => { e.currentTarget.setCustomValidity(''); setAnimalForm((f) => ({ ...f, speciesId: e.target.value, breedId: '' })); }} value={animalForm.speciesId} className="block w-full mt-1 border rounded-lg px-3 py-2"><option value="">اختر النوع</option>{species.map((s) => <option value={s.id} key={s.id}>{s.label}</option>)}</select></label>
        {!species.length && canManageReference && <button type="button" onClick={quickAddSpecies} className="border rounded-lg px-3 py-2 text-sm">+ إضافة نوع</button>}
        <label className="block text-sm text-ink-600">السلالة (اختياري)<select disabled={!animalForm.speciesId} value={animalForm.breedId} onChange={(e) => setAnimalForm((f) => ({ ...f, breedId: e.target.value }))} className="block w-full mt-1 border rounded-lg px-3 py-2 disabled:bg-ink-50"><option value="">بدون سلالة</option>{breeds.map((b) => <option value={b.id} key={b.id}>{b.label}</option>)}</select></label>
        {!!animalForm.speciesId && !breeds.length && canManageReference && <button type="button" onClick={quickAddBreed} className="border rounded-lg px-3 py-2 text-sm">+ إضافة سلالة</button>}
        <div className="grid grid-cols-2 gap-2"><label className="block text-sm text-ink-600">الجنس<select value={animalForm.sex} onChange={(e) => setAnimalForm((f) => ({ ...f, sex: e.target.value }))} className="block w-full mt-1 border rounded-lg px-3 py-2"><option value="">غير محدد</option><option value="ذكر">ذكر</option><option value="أنثى">أنثى</option></select></label><Field label="تاريخ الميلاد (اختياري)" type="date" value={animalForm.dateOfBirth} onChange={(v) => setAnimalForm((f) => ({ ...f, dateOfBirth: v, ageYears: '', ageMonths: '' }))} /><Field label="العمر التقريبي (سنوات)" type="number" value={animalForm.ageYears} onChange={(v) => setAnimalForm((f) => ({ ...f, ageYears: v, dateOfBirth: '' }))} /><Field label="الأشهر الإضافية (0–11)" type="number" value={animalForm.ageMonths} onChange={(v) => setAnimalForm((f) => ({ ...f, ageMonths: v, dateOfBirth: '' }))} /><Field label="الشريحة" value={animalForm.microchip} onChange={(v) => setAnimalForm((f) => ({ ...f, microchip: v }))} /><Field label="معرّف إضافي" value={animalForm.identifier} onChange={(v) => setAnimalForm((f) => ({ ...f, identifier: v }))} /></div>
        <Field label="ملاحظات" value={animalForm.notes} onChange={(v) => setAnimalForm((f) => ({ ...f, notes: v }))} />
        <button disabled={busy || !animalForm.speciesId} className="w-full bg-brand-600 text-white rounded-lg py-2.5">{busy ? 'جارِ الحفظ…' : 'حفظ الحيوان'}</button>
      </form>
    </Modal>
    <Modal open={receiveOpen} onClose={() => setReceiveOpen(false)} title="استلام دفعة من العميل">
      <form onSubmit={receivePayment} className="space-y-3" dir="rtl"><label className="block text-sm">المبلغ<input required inputMode="decimal" value={receiveForm.amount} onChange={(e) => setReceiveForm((f) => ({ ...f, amount: e.target.value }))} className="block w-full mt-1 border rounded-lg px-3 py-2" /></label><label className="block text-sm">طريقة الدفع<select value={receiveForm.method} onChange={(e) => setReceiveForm((f) => ({ ...f, method: e.target.value }))} className="block w-full mt-1 border rounded-lg px-3 py-2"><option value="cash">نقدي</option><option value="card">بطاقة</option><option value="wallet">محفظة</option><option value="other">أخرى</option></select></label><p className="text-xs text-ink-500">سيتم توزيع المبلغ على أقدم الفواتير المستحقة أولًا.</p><button disabled={busy} className="w-full bg-brand-600 text-white rounded-lg py-2.5">تأكيد استلام الدفعة</button></form>
    </Modal>
  </Layout>;
}

function Field({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label className="block text-sm text-ink-600">{label}<input type={type} required={required} min={type === 'number' ? 0 : undefined} max={label.includes('الأشهر') ? 11 : undefined} onInvalid={(e) => (e.currentTarget as HTMLInputElement).setCustomValidity(required ? 'هذا الحقل مطلوب' : 'أدخل قيمة صحيحة')} onInput={(e) => (e.currentTarget as HTMLInputElement).setCustomValidity('')} value={value} onChange={(e) => onChange(e.target.value)} className="w-full mt-1 border rounded-lg px-3 py-2" /></label>;
}

function sexLabel(value?: string) { return value === 'ذكر' || value === 'أنثى' ? value : 'غير محدد'; }
function formatAge(dateText: string, estimated: boolean) {
  const dob = new Date(`${String(dateText).slice(0,10)}T00:00:00Z`); const today = new Date();
  let months = (today.getUTCFullYear() - dob.getUTCFullYear()) * 12 + today.getUTCMonth() - dob.getUTCMonth();
  if (today.getUTCDate() < dob.getUTCDate()) months--;
  months = Math.max(0, months);
  const years = Math.floor(months / 12); const remainder = months % 12;
  const value = years ? `${years === 2 ? 'سنتين' : years === 1 ? 'سنة' : `${years} سنوات`}${remainder ? ` و${remainder} شهر` : ''}` : `${remainder} شهر`;
  return `${estimated ? 'حوالي ' : ''}${value}${estimated ? ' (تقديري)' : ''}`;
}

function moneyIsPositive(value: string) { return /^\d+(?:\.\d{1,2})?$/.test(value) && BigInt(value.split('.')[0]) * 100n + BigInt((value.split('.')[1] ?? '').padEnd(2,'0')) > 0n; }
