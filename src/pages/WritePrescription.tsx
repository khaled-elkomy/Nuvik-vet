import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  Eraser,
  Keyboard,
  MessageCircle,
  PenTool,
  Plus,
  Printer,
  Save,
  Trash2,
} from "lucide-react";
import Modal from "../components/Modal";
import { useApp } from "../context/AppContext";
import { ageFromBirthDate } from "../lib/age";
import {
  appointmentsApi,
  medicalRecordsApi,
  patientsApi,
  prescriptionImagesApi,
  prescriptionsApi,
  queueApi,
  UPLOADS_BASE_URL,
  usersApi,
} from "../lib/api";

type Mode = "text" | "canvas";
type Medication = {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
};
type SelectedInvestigation = {
  id: string;
  name: string;
  category: "laboratory" | "radiology";
  notes: string;
};
const blankMedication = (): Medication => ({
  name: "",
  dosage: "",
  frequency: "",
  duration: "",
  instructions: "",
});

function CanvasSection({
  label,
  target,
  onDraw,
}: {
  label: string;
  target: React.MutableRefObject<HTMLCanvasElement | null>;
  onDraw: () => void;
}) {
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const canvas = target.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, rect.width, rect.height);
    context.strokeStyle = "#1A2B2A";
    context.lineWidth = 2.2;
    context.lineCap = "round";
    context.lineJoin = "round";
  }, [target]);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  return (
    <section className="border border-ink-100 rounded-xl overflow-hidden">
      <h3 className="font-semibold text-sm text-ink-800 bg-ink-50 px-4 py-2.5">
        {label}
      </h3>
      <canvas
        ref={target}
        className="block w-full touch-none cursor-crosshair"
        style={{ height: 170 }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drawing.current = true;
          last.current = point(event);
          onDraw();
        }}
        onPointerMove={(event) => {
          if (!drawing.current || !last.current) return;
          const context = target.current?.getContext("2d");
          if (!context) return;
          const next = point(event);
          context.beginPath();
          context.moveTo(last.current.x, last.current.y);
          context.lineTo(next.x, next.y);
          context.stroke();
          last.current = next;
        }}
        onPointerUp={() => {
          drawing.current = false;
          last.current = null;
        }}
        onPointerLeave={() => {
          drawing.current = false;
          last.current = null;
        }}
      />
    </section>
  );
}

/** يستخدم نفس سجلات التاريخ والعمليات الموجودة في ملف المريض، ولا يخزن نسخة خاصة بالكشف. */
function MedicalHistoryPanel({
  patientId,
  canEdit,
}: {
  patientId: string;
  canEdit: boolean;
}) {
  const { pushToast } = useApp();
  const [history, setHistory] = useState<any[]>([]);
  const [operations, setOperations] = useState<any[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [operationOpen, setOperationOpen] = useState(false);
  const [editingHistory, setEditingHistory] = useState<any>(null);
  const [editingOperation, setEditingOperation] = useState<any>(null);
  const [historyDraft, setHistoryDraft] = useState({
    title: "",
    description: "",
    knownDate: "",
  });
  const [operationDraft, setOperationDraft] = useState({
    operationName: "",
    description: "",
    surgeonName: "",
    operationDate: "",
    facility: "",
    notes: "",
  });

  const refresh = () =>
    Promise.all([
      medicalRecordsApi.listHistory(patientId),
      medicalRecordsApi.listOperations(patientId),
    ])
      .then(([historyRows, operationRows]) => {
        setHistory(historyRows);
        setOperations(operationRows);
      })
      .catch((error: Error) =>
        pushToast(error.message || "تعذّر تحميل التاريخ الطبي", "error"),
      );

  useEffect(() => {
    void refresh();
  }, [patientId]);

  const saveHistory = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (editingHistory)
        await medicalRecordsApi.updateHistory(editingHistory.id, historyDraft);
      else
        await medicalRecordsApi.createHistory({ patientId, ...historyDraft });
      await refresh();
      setHistoryOpen(false);
      setEditingHistory(null);
      setHistoryDraft({ title: "", description: "", knownDate: "" });
      pushToast(
        editingHistory ? "تم تعديل التاريخ المرضي" : "تمت إضافة التاريخ المرضي",
        "success",
      );
    } catch (error: any) {
      pushToast(error.message || "تعذّر حفظ التاريخ المرضي", "error");
    }
  };
  const saveOperation = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (editingOperation)
        await medicalRecordsApi.updateOperation(
          editingOperation.id,
          operationDraft,
        );
      else
        await medicalRecordsApi.createOperation({
          patientId,
          ...operationDraft,
        });
      await refresh();
      setOperationOpen(false);
      setEditingOperation(null);
      setOperationDraft({
        operationName: "",
        description: "",
        surgeonName: "",
        operationDate: "",
        facility: "",
        notes: "",
      });
      pushToast(
        editingOperation
          ? "تم تعديل العملية السابقة"
          : "تمت إضافة العملية السابقة",
        "success",
      );
    } catch (error: any) {
      pushToast(error.message || "تعذّر حفظ العملية السابقة", "error");
    }
  };
  const date = (value?: string) =>
    value ? new Date(value).toLocaleDateString("ar-EG") : "—";
  const openHistory = (row?: any) => {
    setEditingHistory(row || null);
    setHistoryDraft(
      row
        ? {
            title: row.title,
            description: row.description,
            knownDate: row.known_date || "",
          }
        : { title: "", description: "", knownDate: "" },
    );
    setHistoryOpen(true);
  };
  const openOperation = (row?: any) => {
    setEditingOperation(row || null);
    setOperationDraft(
      row
        ? {
            operationName: row.operation_name,
            description: row.description || "",
            surgeonName: row.surgeon_name || "",
            operationDate: row.operation_date || "",
            facility: row.facility || "",
            notes: row.notes || "",
          }
        : {
            operationName: "",
            description: "",
            surgeonName: "",
            operationDate: "",
            facility: "",
            notes: "",
          },
    );
    setOperationOpen(true);
  };

  return (
    <section className="print:hidden clinic-card p-5 mb-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-bold text-ink-800">التاريخ الطبي</h2>
          <p className="text-xs text-ink-400 mt-1">
            سجل المريض المشترك — متاح للتعديل أثناء جاري الكشف
          </p>
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-ink-800 text-sm">
              التاريخ المرضي
            </h3>
            {canEdit && (
              <button
                onClick={() => openHistory()}
                className="text-brand-600 text-xs font-semibold"
              >
                <Plus size={14} className="inline ml-1" />
                إضافة التاريخ المرضي
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-ink-400 bg-ink-50 rounded-lg p-4">
              لا يوجد تاريخ مرضي مسجل لهذا المريض.
            </p>
          ) : (
            <div className="space-y-2">
              {history.map((row) => (
                <div
                  key={row.id}
                  className="border border-ink-100 rounded-lg p-3"
                >
                  <div className="flex justify-between gap-3">
                    <p className="font-semibold text-sm text-ink-800">
                      {row.title}
                    </p>
                    {canEdit && (
                      <button
                        onClick={() => openHistory(row)}
                        className="text-brand-600 text-xs"
                      >
                        تعديل التاريخ المرضي
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-ink-600 mt-1 whitespace-pre-wrap">
                    {row.description}
                  </p>
                  <p className="text-xs text-ink-400 mt-2">
                    {date(row.known_date)} · {row.doctor_name}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-ink-800 text-sm">
              العمليات السابقة
            </h3>
            {canEdit && (
              <button
                onClick={() => openOperation()}
                className="text-brand-600 text-xs font-semibold"
              >
                <Plus size={14} className="inline ml-1" />
                إضافة عملية سابقة
              </button>
            )}
          </div>
          {operations.length === 0 ? (
            <p className="text-sm text-ink-400 bg-ink-50 rounded-lg p-4">
              لا توجد عمليات سابقة مسجلة.
            </p>
          ) : (
            <div className="space-y-2">
              {operations.map((row) => (
                <div
                  key={row.id}
                  className="border border-ink-100 rounded-lg p-3"
                >
                  <div className="flex justify-between gap-3">
                    <p className="font-semibold text-sm text-ink-800">
                      {row.operation_name}
                    </p>
                    {canEdit && (
                      <button
                        onClick={() => openOperation(row)}
                        className="text-brand-600 text-xs"
                      >
                        تعديل العملية
                      </button>
                    )}
                  </div>
                  {row.description && (
                    <p className="text-sm text-ink-600 mt-1">
                      {row.description}
                    </p>
                  )}
                  <p className="text-xs text-ink-400 mt-2">
                    {date(row.operation_date)} · {row.facility || "—"}
                    {row.surgeon_name ? ` · ${row.surgeon_name}` : ""}
                  </p>
                  {row.notes && (
                    <p className="text-xs text-ink-500 mt-1">{row.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={editingHistory ? "تعديل التاريخ المرضي" : "إضافة التاريخ المرضي"}
      >
        <form onSubmit={saveHistory} className="space-y-3">
          <input
            required
            value={historyDraft.title}
            onChange={(event) =>
              setHistoryDraft({ ...historyDraft, title: event.target.value })
            }
            placeholder="العنوان"
            className="w-full bg-ink-50 border rounded-lg px-3 py-2.5 text-sm"
          />
          <textarea
            required
            value={historyDraft.description}
            onChange={(event) =>
              setHistoryDraft({
                ...historyDraft,
                description: event.target.value,
              })
            }
            placeholder="الوصف"
            rows={4}
            className="w-full bg-ink-50 border rounded-lg px-3 py-2.5 text-sm"
          />
          <input
            type="date"
            value={historyDraft.knownDate}
            onChange={(event) =>
              setHistoryDraft({
                ...historyDraft,
                knownDate: event.target.value,
              })
            }
            className="w-full bg-ink-50 border rounded-lg px-3 py-2.5 text-sm"
          />
          <button className="w-full bg-brand-600 text-white font-semibold rounded-lg py-2.5">
            حفظ
          </button>
        </form>
      </Modal>
      <Modal
        open={operationOpen}
        onClose={() => setOperationOpen(false)}
        title={editingOperation ? "تعديل عملية سابقة" : "إضافة عملية سابقة"}
      >
        <form onSubmit={saveOperation} className="space-y-3">
          <input
            required
            value={operationDraft.operationName}
            onChange={(event) =>
              setOperationDraft({
                ...operationDraft,
                operationName: event.target.value,
              })
            }
            placeholder="اسم العملية"
            className="w-full bg-ink-50 border rounded-lg px-3 py-2.5 text-sm"
          />
          <textarea
            value={operationDraft.description}
            onChange={(event) =>
              setOperationDraft({
                ...operationDraft,
                description: event.target.value,
              })
            }
            placeholder="وصف العملية"
            rows={2}
            className="w-full bg-ink-50 border rounded-lg px-3 py-2.5 text-sm"
          />
          <input
            type="date"
            value={operationDraft.operationDate}
            onChange={(event) =>
              setOperationDraft({
                ...operationDraft,
                operationDate: event.target.value,
              })
            }
            className="w-full bg-ink-50 border rounded-lg px-3 py-2.5 text-sm"
          />
          <input
            value={operationDraft.facility}
            onChange={(event) =>
              setOperationDraft({
                ...operationDraft,
                facility: event.target.value,
              })
            }
            placeholder="المستشفى / المنشأة"
            className="w-full bg-ink-50 border rounded-lg px-3 py-2.5 text-sm"
          />
          <input
            value={operationDraft.surgeonName}
            onChange={(event) =>
              setOperationDraft({
                ...operationDraft,
                surgeonName: event.target.value,
              })
            }
            placeholder="اسم الطبيب/الجراح (اختياري)"
            className="w-full bg-ink-50 border rounded-lg px-3 py-2.5 text-sm"
          />
          <textarea
            value={operationDraft.notes}
            onChange={(event) =>
              setOperationDraft({
                ...operationDraft,
                notes: event.target.value,
              })
            }
            placeholder="ملاحظات اختيارية"
            rows={2}
            className="w-full bg-ink-50 border rounded-lg px-3 py-2.5 text-sm"
          />
          <button className="w-full bg-brand-600 text-white font-semibold rounded-lg py-2.5">
            حفظ
          </button>
        </form>
      </Modal>
    </section>
  );
}

export default function WritePrescription() {
  const { id: patientId } = useParams();
  const navigate = useNavigate();
  const { currentUser, pushToast } = useApp();
  const [patient, setPatient] = useState<any>(null);
  const [loadingPatient, setLoadingPatient] = useState(true);
  const [doctor, setDoctor] = useState<any>(currentUser);
  const [mode, setMode] = useState<Mode>("text");
  const [diagnosis, setDiagnosis] = useState("");
  const [warnings, setWarnings] = useState("");
  const [medications, setMedications] = useState<Medication[]>([
    blankMedication(),
  ]);
  const [types, setTypes] = useState<any[]>([]);
  const [laboratoryTypeId, setLaboratoryTypeId] = useState("");
  const [laboratoryNote, setLaboratoryNote] = useState("");
  const [radiologyTypeId, setRadiologyTypeId] = useState("");
  const [radiologyNote, setRadiologyNote] = useState("");
  const [investigations, setInvestigations] = useState<SelectedInvestigation[]>(
    [],
  );
  const medicationCanvas = useRef<HTMLCanvasElement | null>(null);
  const warningCanvas = useRef<HTMLCanvasElement | null>(null);
  const investigationCanvas = useRef<HTMLCanvasElement | null>(null);
  const [hasMedicationDrawing, setHasMedicationDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUp, setFollowUp] = useState({ date: "", time: "", notes: "" });
  const [booking, setBooking] = useState(false);
  const [hasActiveExamination, setHasActiveExamination] = useState(false);

  useEffect(() => {
    usersApi
      .me()
      .then(setDoctor)
      .catch(() => {});
    medicalRecordsApi
      .listInvestigationTypes()
      .then(setTypes)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!patientId) {
      setLoadingPatient(false);
      return;
    }
    let active = true;
    patientsApi
      .get(patientId)
      .then(
        (row) => active && setPatient({ ...row, age: ageFromBirthDate(row.birthDate) }),
      )
      .catch(
        (error: Error) =>
          active &&
          pushToast(error.message || "تعذّر تحميل بيانات المريض", "error"),
      )
      .finally(() => active && setLoadingPatient(false));
    return () => {
      active = false;
    };
  }, [patientId, pushToast]);
  useEffect(() => {
    if (!patientId) return;
    let active = true;
    queueApi
      .hasActiveExamination(patientId)
      .then(({ hasActive }) => {
        if (active) setHasActiveExamination(hasActive);
      })
      .catch(() => {
        if (active) setHasActiveExamination(false);
      });
    return () => {
      active = false;
    };
  }, [patientId]);

  const updateMedication = (
    index: number,
    field: keyof Medication,
    value: string,
  ) =>
    setMedications((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    );
  const addInvestigation = (typeId: string, note: string) => {
    const selected = types.find((item) => item.id === typeId);
    if (!selected) return;
    setInvestigations((items) => [
      ...items,
      {
        id: selected.id,
        name: selected.name,
        category: selected.category,
        notes: note.trim(),
      },
    ]);
  };
  const blobFor = (ref: React.MutableRefObject<HTMLCanvasElement | null>) =>
    new Promise<Blob | null>((resolve) =>
      ref.current?.toBlob(resolve, "image/png"),
    );
  const clearCanvas = (
    ref: React.MutableRefObject<HTMLCanvasElement | null>,
  ) => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      const rect = canvas.getBoundingClientRect();
      context.fillStyle = "#fff";
      context.fillRect(0, 0, rect.width, rect.height);
    }
  };
  const clearAll = () => {
    if (mode === "text") {
      setDiagnosis("");
      setWarnings("");
      setMedications([blankMedication()]);
      setInvestigations([]);
    } else {
      clearCanvas(medicationCanvas);
      clearCanvas(warningCanvas);
      clearCanvas(investigationCanvas);
      setHasMedicationDrawing(false);
    }
  };
  const validateText = () => {
    if (!diagnosis.trim()) {
      pushToast("اكتب التشخيص قبل الحفظ", "error");
      return false;
    }
    if (!medications.some((item) => item.name.trim())) {
      pushToast("أضف دواء واحدًا على الأقل", "error");
      return false;
    }
    return true;
  };
  const persist = async () => {
    if (!patientId) throw new Error("المريض غير محدد");
    if (mode === "text") {
      if (!validateText()) return null;
      const cleaned = medications
        .filter((item) => item.name.trim())
        .map((item) => ({
          name: item.name.trim(),
          dosage: item.dosage.trim() || "—",
          frequency: item.frequency.trim() || "—",
          duration: item.duration.trim() || "—",
          instructions: item.instructions.trim() || "—",
        }));
      await prescriptionsApi.create({
        patientId,
        diagnosis: diagnosis.trim(),
        medications: cleaned,
        instructions: warnings.trim() || undefined,
      });
      await Promise.all(
        investigations.map((item) =>
          medicalRecordsApi.createInvestigation({
            patientId,
            investigationTypeId: item.id,
            notes: item.notes || undefined,
          }),
        ),
      );
      return { kind: "text" as const, medications: cleaned };
    }
    if (!hasMedicationDrawing) {
      pushToast("اكتب الأدوية في قسم الأدوية قبل الحفظ", "error");
      return null;
    }
    const medicationsBlob = await blobFor(medicationCanvas);
    const instructionsBlob = await blobFor(warningCanvas);
    const investigationsBlob = await blobFor(investigationCanvas);
    if (!medicationsBlob) throw new Error("تعذّر تجهيز الروشتة");
    const image = await prescriptionImagesApi.upload(patientId, {
      medications: medicationsBlob,
      instructions: instructionsBlob,
      investigations: investigationsBlob,
    });
    return { kind: "canvas" as const, image };
  };
  const save = async () => {
    setSaving(true);
    try {
      const saved = await persist();
      if (!saved) return;
      pushToast("تم حفظ الروشتة بنجاح", "success");
      setChoiceOpen(true);
    } catch (error: any) {
      pushToast(error.message || "تعذّر حفظ الروشتة", "error");
    } finally {
      setSaving(false);
    }
  };
  const noFollowUp = () => {
    setChoiceOpen(false);
    navigate("/queue");
  };
  const bookFollowUp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!patientId) return;
    setBooking(true);
    try {
      await appointmentsApi.create({
        patientId,
        date: followUp.date,
        time: followUp.time,
        type: "متابعة",
        notes: followUp.notes,
        isFollowUp: true,
      });
      pushToast("تم حجز موعد المتابعة", "success");
      setFollowUpOpen(false);
      setChoiceOpen(false);
      navigate("/queue");
    } catch (error: any) {
      pushToast(error.message || "تعذّر حجز موعد المتابعة", "error");
    } finally {
      setBooking(false);
    }
  };
  const whatsapp = async () => {
    if (!patient) return;
    setSending(true);
    try {
      const saved = await persist();
      if (!saved) return;
      const phone = patient.phone.replace(/\D/g, "").replace(/^0/, "20");
      const message =
        saved.kind === "text"
          ? `روشتة من ${doctor?.fullName || "العيادة"}\nالمريض: ${patient.fullName}\nالتشخيص: ${diagnosis}\n\nالأدوية:\n${saved.medications.map((item) => `- ${item.name} (${item.dosage}، ${item.frequency}، ${item.duration})`).join("\n")}${warnings ? `\n\nتعليمات: ${warnings}` : ""}`
          : `روشتتك من ${doctor?.fullName || "العيادة"}:\n${UPLOADS_BASE_URL}${(await prescriptionImagesApi.getShareUrl(saved.image.id)).shareUrl}`;
      window.open(
        `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
        "_blank",
        "noopener",
      );
      setChoiceOpen(true);
    } catch (error: any) {
      pushToast(error.message || "تعذّر إرسال الروشتة", "error");
    } finally {
      setSending(false);
    }
  };

  if (loadingPatient)
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50">
        جارِ تحميل بيانات المريض...
      </div>
    );
  if (!patient)
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50">
        لم يتم العثور على هذا المريض
      </div>
    );
  return (
    <div className="min-h-screen bg-ink-100 flex flex-col">
      <header className="print:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-ink-200">
        <button
          onClick={() => navigate("/queue")}
          className="text-sm text-ink-500"
        >
          <ArrowRight size={16} className="inline ml-1" />
          العودة للفحص
        </button>
        <h1 className="font-bold text-ink-800">روشتة — {patient.fullName}</h1>
        <div className="mr-auto bg-ink-50 rounded-lg p-1">
          <button
            onClick={() => setMode("text")}
            className={`px-3 py-1.5 text-xs rounded-md ${mode === "text" ? "bg-white shadow-sm text-brand-700" : "text-ink-500"}`}
          >
            <Keyboard size={14} className="inline ml-1" />
            كيبورد
          </button>
          <button
            onClick={() => setMode("canvas")}
            className={`px-3 py-1.5 text-xs rounded-md ${mode === "canvas" ? "bg-white shadow-sm text-brand-700" : "text-ink-500"}`}
          >
            <PenTool size={14} className="inline ml-1" />
            رسم حر
          </button>
        </div>
      </header>
      <main className="flex-1 p-3 sm:p-6">
        <MedicalHistoryPanel
          patientId={patientId!}
          canEdit={hasActiveExamination}
        />
        <div
          id="prescription-print-area"
          className="clinic-card overflow-hidden"
        >
          <div className="flex justify-between p-4 border-b-2 border-brand-600">
            <div>
              <p className="font-bold text-ink-800">
                {doctor?.fullName || "اسم الطبيب"}
              </p>
              <p className="text-sm text-brand-700">
                {doctor?.specialty || "التخصص"}
              </p>
            </div>
            <div className="text-left text-xs text-ink-500">
              <p>{patient.fullName}</p>
              <p>
                {patient.age} سنة · {patient.fileNumber}
              </p>
            </div>
          </div>
          {mode === "text" ? (
            <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
              <div>
                <label className="block text-sm font-semibold mb-1">
                  التشخيص
                </label>
                <textarea
                  value={diagnosis}
                  onChange={(event) => setDiagnosis(event.target.value)}
                  rows={2}
                  className="w-full bg-ink-50 border rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-semibold">الأدوية</label>
                  <button
                    onClick={() =>
                      setMedications((items) => [...items, blankMedication()])
                    }
                    className="text-brand-600 text-xs"
                  >
                    <Plus size={14} className="inline" /> إضافة دواء
                  </button>
                </div>
                {medications.map((item, index) => (
                  <div key={index} className="grid md:grid-cols-5 gap-2 mb-2">
                    <input
                      value={item.name}
                      onChange={(event) =>
                        updateMedication(index, "name", event.target.value)
                      }
                      placeholder="اسم الدواء"
                      className="bg-ink-50 border rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      value={item.dosage}
                      onChange={(event) =>
                        updateMedication(index, "dosage", event.target.value)
                      }
                      placeholder="الجرعة"
                      className="bg-ink-50 border rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      value={item.frequency}
                      onChange={(event) =>
                        updateMedication(index, "frequency", event.target.value)
                      }
                      placeholder="التكرار"
                      className="bg-ink-50 border rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      value={item.duration}
                      onChange={(event) =>
                        updateMedication(index, "duration", event.target.value)
                      }
                      placeholder="المدة"
                      className="bg-ink-50 border rounded-lg px-3 py-2 text-sm"
                    />
                    <div className="flex gap-1">
                      <input
                        value={item.instructions}
                        onChange={(event) =>
                          updateMedication(
                            index,
                            "instructions",
                            event.target.value,
                          )
                        }
                        placeholder="تعليمات"
                        className="min-w-0 flex-1 bg-ink-50 border rounded-lg px-3 py-2 text-sm"
                      />
                      <button
                        disabled={medications.length === 1}
                        onClick={() =>
                          setMedications((items) =>
                            items.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                        className="text-red-500 disabled:opacity-30"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">
                  تحذيرات وتعليمات عامة
                </label>
                <textarea
                  value={warnings}
                  onChange={(event) => setWarnings(event.target.value)}
                  rows={2}
                  className="w-full bg-ink-50 border rounded-lg px-3 py-2"
                  placeholder="مثل: تجنب القيادة أو أطعمة/أدوية محددة"
                />
              </div>
              <section className="border-t pt-5">
                <p className="font-semibold text-ink-800 mb-2">
                  الفحوصات المطلوبة
                </p>
                <div className="grid lg:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4">
                    <h3 className="font-semibold text-sky-950 mb-3">التحاليل المعملية</h3>
                    <div className="space-y-2">
                      <select value={laboratoryTypeId} onChange={(event) => setLaboratoryTypeId(event.target.value)} className="w-full bg-white border border-sky-200 rounded-lg px-3 py-2 text-sm text-ink-800">
                        <option value="">اختر تحليلًا</option>
                        {types.filter((item) => item.category === "laboratory").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                      <input value={laboratoryNote} onChange={(event) => setLaboratoryNote(event.target.value)} placeholder="ملاحظات اختيارية" className="w-full bg-white border border-sky-200 rounded-lg px-3 py-2 text-sm text-ink-800 placeholder:text-ink-500" />
                      <button disabled={!laboratoryTypeId} onClick={() => { addInvestigation(laboratoryTypeId, laboratoryNote); setLaboratoryTypeId(""); setLaboratoryNote(""); }} className="w-full bg-sky-700 hover:bg-sky-800 disabled:bg-sky-300 text-white rounded-lg px-4 py-2 text-sm font-semibold">إضافة تحليل</button>
                    </div>
                  </div>
                  <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-4">
                    <h3 className="font-semibold text-violet-950 mb-3">الأشعة والتصوير</h3>
                    <div className="space-y-2">
                      <select value={radiologyTypeId} onChange={(event) => setRadiologyTypeId(event.target.value)} className="w-full bg-white border border-violet-200 rounded-lg px-3 py-2 text-sm text-ink-800">
                        <option value="">اختر أشعة أو تصويرًا</option>
                        {types.filter((item) => item.category === "radiology").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                      <input value={radiologyNote} onChange={(event) => setRadiologyNote(event.target.value)} placeholder="ملاحظات اختيارية" className="w-full bg-white border border-violet-200 rounded-lg px-3 py-2 text-sm text-ink-800 placeholder:text-ink-500" />
                      <button disabled={!radiologyTypeId} onClick={() => { addInvestigation(radiologyTypeId, radiologyNote); setRadiologyTypeId(""); setRadiologyNote(""); }} className="w-full bg-violet-700 hover:bg-violet-800 disabled:bg-violet-300 text-white rounded-lg px-4 py-2 text-sm font-semibold">إضافة أشعة</button>
                    </div>
                  </div>
                </div>
                {investigations.length > 0 && (
                  <div className="mt-3 grid sm:grid-cols-2 gap-2">
                    {investigations.map((item, index) => (
                      <div
                        key={`${item.id}-${index}`}
                        className={`rounded-lg px-3 py-2 text-sm font-medium flex justify-between ${item.category === "laboratory" ? "bg-sky-100 text-sky-950" : "bg-violet-100 text-violet-950"}`}
                      >
                        <span>
                          {item.category === "laboratory" ? "تحليل" : "أشعة"} —{" "}
                          {item.name}
                          {item.notes ? `: ${item.notes}` : ""}
                        </span>
                        <button
                          onClick={() =>
                            setInvestigations((items) =>
                              items.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            )
                          }
                          className="text-red-600"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="p-4 sm:p-6 space-y-4">
              <p className="text-sm text-ink-500">
                كل قسم مستقل ويحفظ كجزء من نفس الروشتة. موعد المتابعة قرار منفصل
                بعد الحفظ.
              </p>
              <CanvasSection
                label="الأدوية"
                target={medicationCanvas}
                onDraw={() => setHasMedicationDrawing(true)}
              />
              <CanvasSection
                label="تحذيرات وتعليمات"
                target={warningCanvas}
                onDraw={() => {}}
              />
              <CanvasSection
                label="الفحوصات المطلوبة"
                target={investigationCanvas}
                onDraw={() => {}}
              />
            </div>
          )}
        </div>
        <div className="print:hidden flex flex-wrap gap-2 mt-4">
          <button
            onClick={clearAll}
            className="border border-ink-200 rounded-lg px-4 py-2.5 text-sm"
          >
            <Eraser size={16} className="inline ml-1" />
            مسح
          </button>
          <button
            onClick={() => window.print()}
            className="border border-ink-200 rounded-lg px-4 py-2.5 text-sm"
          >
            <Printer size={16} className="inline ml-1" />
            طباعة
          </button>
          <button
            onClick={whatsapp}
            disabled={sending}
            className="bg-[#25D366] text-white rounded-lg px-4 py-2.5 text-sm"
          >
            <MessageCircle size={16} className="inline ml-1" />
            {sending ? "جارِ التجهيز..." : "إرسال واتساب"}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="mr-auto bg-brand-600 text-white rounded-lg px-5 py-2.5 text-sm font-semibold"
          >
            <Save size={16} className="inline ml-1" />
            {saving ? "جارِ الحفظ..." : "إنهاء وحفظ الروشتة"}
          </button>
        </div>
      </main>
      <Modal open={choiceOpen} onClose={noFollowUp} title="هل تريد حجز متابعة؟">
        <div className="space-y-3">
          <p className="text-sm text-ink-600">
            سيُنشئ الاختيار موعدًا مستقبليًا باستخدام نظام المواعيد الحالي.
          </p>
          <button
            onClick={() => {
              setChoiceOpen(false);
              setFollowUpOpen(true);
            }}
            className="w-full bg-brand-600 text-white font-semibold rounded-lg py-2.5"
          >
            نعم، حجز متابعة
          </button>
          <button
            onClick={noFollowUp}
            className="w-full border border-ink-200 text-ink-700 font-semibold rounded-lg py-2.5"
          >
            لا، لا توجد متابعة
          </button>
        </div>
      </Modal>
      <Modal
        open={followUpOpen}
        onClose={() => setFollowUpOpen(false)}
        title="حجز موعد متابعة"
      >
        <form onSubmit={bookFollowUp} className="space-y-3">
          <input
            required
            type="date"
            value={followUp.date}
            onChange={(event) =>
              setFollowUp({ ...followUp, date: event.target.value })
            }
            className="w-full bg-ink-50 border rounded-lg px-3 py-2.5"
          />
          <input
            required
            type="time"
            value={followUp.time}
            onChange={(event) =>
              setFollowUp({ ...followUp, time: event.target.value })
            }
            className="w-full bg-ink-50 border rounded-lg px-3 py-2.5"
          />
          <textarea
            value={followUp.notes}
            onChange={(event) =>
              setFollowUp({ ...followUp, notes: event.target.value })
            }
            placeholder="ملاحظات اختيارية"
            className="w-full bg-ink-50 border rounded-lg px-3 py-2.5"
            rows={3}
          />
          <button
            disabled={booking}
            className="w-full bg-brand-600 text-white font-semibold rounded-lg py-2.5"
          >
            {booking ? "جارِ الحجز..." : "حجز المتابعة"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
