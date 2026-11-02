import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Barcode, PackagePlus, Plus, Search, Wrench, X } from 'lucide-react';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { catalogApi } from '../lib/api';
import { useApp } from '../context/AppContext';

type VariantDraft = { sku: string; name: string; unit: string; price: string; cost: string; barcodes: string };
const blankVariant = (): VariantDraft => ({ sku: '', name: '', unit: 'قطعة', price: '0.00', cost: '0.00', barcodes: '' });

export default function Products() {
  const { currentUser, pushToast } = useApp();
  const [rows, setRows] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', category: '', description: '', isService: false, trackLots: false, defaultUnitPrice: '0.00' });
  const [variants, setVariants] = useState<VariantDraft[]>([blankVariant()]);
  const canWrite = currentUser?.permissions.some((p) => ['catalog.prices.manage', 'goods_receipts.post'].includes(p)) ?? false;
  const canPrice = currentUser?.permissions.includes('catalog.prices.manage') ?? false;

  const refresh = useCallback(async () => setRows(await catalogApi.products(query)), [query]);
  useEffect(() => { refresh().catch((e) => pushToast(e.message, 'error')); }, [refresh, pushToast]);

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const payload: any = { ...form, variants: form.isService ? [] : variants.map((v) => {
        const data: any = { ...v, barcodes: v.barcodes.split(',').map((x) => x.trim()).filter(Boolean) };
        if (!canPrice) { delete data.price; delete data.cost; }
        return data;
      }) };
      if (!canPrice) delete payload.defaultUnitPrice;
      await catalogApi.createProduct(payload);
      setOpen(false); setForm({ code: '', name: '', category: '', description: '', isService: false, trackLots: false, defaultUnitPrice: '0.00' }); setVariants([blankVariant()]); await refresh(); pushToast('تمت إضافة المنتج إلى الكتالوج');
    } catch (e) { pushToast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  async function addOpeningStock(variant: any, product: any) {
    const quantity = window.prompt(`كمية الرصيد الافتتاحي لـ ${product.name} / ${variant.name}`);
    if (!quantity) return;
    const payload: any = { quantity };
    if (product.trackLots) {
      const lotNumber = window.prompt('رقم التشغيلة'); if (!lotNumber) return;
      payload.lotNumber = lotNumber;
      payload.expiryDate = window.prompt('تاريخ الانتهاء (YYYY-MM-DD)، أو اتركه فارغًا') || null;
    }
    try { const result = await catalogApi.openingStock(variant.id, payload); await refresh(); pushToast(`تم تسجيل الرصيد. المتاح الآن ${result.onHand}`); }
    catch (e) { pushToast((e as Error).message, 'error'); }
  }

  async function deactivate(product: any) {
    if (!window.confirm(`إيقاف ${product.name} من البيع؟`)) return;
    try { await catalogApi.deactivateProduct(product.id); await refresh(); pushToast('تم إيقاف المنتج'); }
    catch (e) { pushToast((e as Error).message, 'error'); }
  }

  return <Layout title="الكتالوج والمخزون">
    <div dir="rtl" className="space-y-5">
      <div className="bg-white rounded-xl2 border border-ink-100 p-4 flex gap-3 items-center"><div className="relative flex-1"><Search size={17} className="absolute right-3 top-2.5 text-ink-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو الرمز أو الباركود" className="w-full pr-9 pl-3 py-2 border rounded-lg" /></div>{canWrite && <button onClick={() => setOpen(true)} className="bg-brand-600 text-white rounded-lg px-4 py-2 inline-flex items-center gap-2"><Plus size={17} />إضافة منتج</button>}</div>
      <div className="grid gap-4">{rows.map((product) => <article key={product.id} className="bg-white rounded-xl2 border border-ink-100 p-4 sm:p-5">
        <div className="flex items-start gap-3"><div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 grid place-items-center">{product.isService ? <Wrench size={19} /> : <PackagePlus size={19} />}</div><div className="flex-1"><h2 className="font-bold text-ink-800">{product.name}</h2><p className="text-xs text-ink-500 mt-1">{product.code}{product.category ? ` · ${product.category}` : ''}{product.isService ? ' · خدمة' : product.trackLots ? ' · يتطلب رقم تشغيلة' : ''}</p></div>{canWrite && <button onClick={() => deactivate(product)} className="text-xs text-red-600 border rounded-lg px-2.5 py-1.5">إيقاف</button>}</div>
        {product.isService ? <p className="text-sm text-ink-600 mt-4">السعر: {product.defaultUnitPrice ?? '0.00'} {product.currency}</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead><tr className="text-xs text-ink-500 border-b"><th className="text-right py-2">المتغير</th><th className="text-right py-2">SKU / باركود</th><th className="text-right py-2">السعر</th><th className="text-right py-2">الرصيد</th><th></th></tr></thead><tbody>{(product.variants || []).map((v: any) => <tr key={v.id} className="border-b last:border-0"><td className="py-3 font-medium">{v.name} <span className="text-xs text-ink-400">/ {v.unit}</span></td><td className="py-3 text-ink-500">{v.sku}<div className="text-xs flex gap-1 mt-1"><Barcode size={13} />{(v.barcodes || []).join('، ') || 'بدون باركود'}</div></td><td className="py-3">{v.price} {v.currency}</td><td className="py-3">{v.onHand}</td><td className="py-3 text-left">{canWrite && <button onClick={() => addOpeningStock(v, product)} className="text-brand-700 border border-brand-200 rounded-lg px-2.5 py-1.5 text-xs">رصيد افتتاحي</button>}</td></tr>)}</tbody></table></div>}
      </article>)}{!rows.length && <div className="bg-white border rounded-xl2 p-10 text-center text-ink-400">لا توجد منتجات مطابقة</div>}</div>
    </div>
    <Modal open={open} onClose={() => setOpen(false)} title="إضافة منتج" maxWidth="max-w-3xl">
      <form onSubmit={save} className="space-y-4" dir="rtl">
        <div className="grid sm:grid-cols-2 gap-3"><Field label="رمز المنتج" value={form.code} onChange={(v) => setForm((f) => ({ ...f, code: v }))} required /><Field label="اسم المنتج" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} required /><Field label="التصنيف" value={form.category} onChange={(v) => setForm((f) => ({ ...f, category: v }))} /><Field label="وصف" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} /></div>
        <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" disabled={!canPrice} checked={form.isService} onChange={(e) => setForm((f) => ({ ...f, isService: e.target.checked, trackLots: false }))} />خدمة بدون مخزون</label>{!form.isService && <label className="flex items-center gap-2"><input type="checkbox" checked={form.trackLots} onChange={(e) => setForm((f) => ({ ...f, trackLots: e.target.checked }))} />تتبع التشغيلات والانتهاء</label>}</div>
        {form.isService ? <Field label={`السعر (${canPrice ? 'تسعير المدير' : 'سعر الخدمة'})`} value={form.defaultUnitPrice} onChange={(v) => setForm((f) => ({ ...f, defaultUnitPrice: v }))} required /> : <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-bold">المتغيرات والباركودات</h3><button type="button" onClick={() => setVariants((list) => [...list, blankVariant()])} className="text-brand-700 text-sm inline-flex gap-1 items-center"><Plus size={15} />متغير آخر</button></div>{variants.map((v, index) => <div key={index} className="rounded-xl bg-ink-50 p-3 space-y-2"><div className="flex justify-between text-sm font-semibold"><span>متغير {index + 1}</span>{variants.length > 1 && <button type="button" onClick={() => setVariants((list) => list.filter((_, i) => i !== index))}><X size={15} /></button>}</div><div className="grid sm:grid-cols-2 gap-2"><Field label="SKU" value={v.sku} onChange={(value) => setVariant(index, 'sku', value, variants, setVariants)} required /><Field label="اسم المتغير" value={v.name} onChange={(value) => setVariant(index, 'name', value, variants, setVariants)} required /><Field label="الوحدة" value={v.unit} onChange={(value) => setVariant(index, 'unit', value, variants, setVariants)} required /><Field label="السعر" value={v.price} onChange={(value) => setVariant(index, 'price', value, variants, setVariants)} required disabled={!canPrice} /><Field label="التكلفة" value={v.cost} onChange={(value) => setVariant(index, 'cost', value, variants, setVariants)} disabled={!canPrice} /><Field label="باركودات (افصل بينها بفاصلة)" value={v.barcodes} onChange={(value) => setVariant(index, 'barcodes', value, variants, setVariants)} /></div></div>)}</div>}
        <button disabled={busy} className="w-full bg-brand-600 text-white rounded-lg py-2.5">{busy ? 'جارِ الحفظ…' : 'حفظ المنتج'}</button>
      </form>
    </Modal>
  </Layout>;
}

function setVariant(index: number, field: keyof VariantDraft, value: string, variants: VariantDraft[], setVariants: (next: VariantDraft[]) => void) {
  setVariants(variants.map((variant, i) => i === index ? { ...variant, [field]: value } : variant));
}

function Field({ label, value, onChange, required = false, disabled = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; disabled?: boolean }) {
  return <label className="block text-sm text-ink-600">{label}<input required={required} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} className="w-full mt-1 border rounded-lg px-3 py-2 disabled:bg-ink-100" /></label>;
}
