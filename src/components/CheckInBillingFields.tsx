type CheckInBillingFieldsProps = {
  services: any[];
  loading: boolean;
  serviceId: string;
  onServiceIdChange: (value: string) => void;
  paymentAmount: string;
  onPaymentAmountChange: (value: string) => void;
  paymentMethod: string;
  onPaymentMethodChange: (value: string) => void;
  disabled?: boolean;
};

/** Shared by every Reception check-in path so billing cannot be bypassed in the UI. */
export default function CheckInBillingFields({
  services, loading, serviceId, onServiceIdChange, paymentAmount, onPaymentAmountChange,
  paymentMethod, onPaymentMethodChange, disabled = false,
}: CheckInBillingFieldsProps) {
  const hasPayment = Number(paymentAmount || '0') > 0;
  return <section className="mt-5 rounded-lg border border-clinical-100 bg-clinical-50/50 p-4 space-y-3">
    <div>
      <h3 className="font-bold text-ink-800">الخدمة والتحصيل</h3>
      <p className="text-xs text-ink-500 mt-0.5">تُنشأ الفاتورة عند تأكيد الحضور. أدخل 0 إذا لم يتم تحصيل أي مبلغ الآن.</p>
    </div>
    <div>
      <label className="block text-sm font-medium text-ink-600 mb-1.5">الخدمة المؤكدة *</label>
      <select value={serviceId} onChange={(e) => onServiceIdChange(e.target.value)} disabled={disabled || loading} className="w-full bg-white border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm">
        <option value="">{loading ? 'جارِ تحميل الخدمات...' : 'اختر الخدمة'}</option>
        {services.map((service) => <option key={service.id} value={service.id}>{service.name} — {service.price} ج.م</option>)}
      </select>
      {!loading && services.length === 0 && <p className="text-xs text-red-600 mt-1.5">لا توجد خدمات نشطة قابلة للفوترة.</p>}
    </div>
    <div>
      <label className="block text-sm font-medium text-ink-600 mb-1.5">المبلغ المدفوع الآن *</label>
      <input type="number" min="0" step="0.01" value={paymentAmount} onChange={(e) => onPaymentAmountChange(e.target.value)} disabled={disabled} className="w-full bg-white border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm" />
    </div>
    {hasPayment && <div>
      <label className="block text-sm font-medium text-ink-600 mb-1.5">طريقة الدفع *</label>
      <select value={paymentMethod} onChange={(e) => onPaymentMethodChange(e.target.value)} disabled={disabled} className="w-full bg-white border border-ink-100 rounded-lg px-3.5 py-2.5 text-sm">
        <option value="cash">نقدي</option><option value="card">بطاقة</option><option value="instapay">InstaPay</option><option value="transfer">تحويل</option>
      </select>
    </div>}
  </section>;
}
