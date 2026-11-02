import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { attachmentsApi } from '../lib/api';

/**
 * المرفقات بقت ملفات محمية (لازم تسجيل دخول لعرضها)، فمينفعش نحطها في <img src>
 * عادي — بنجيبها كـ Blob بالتوكن ونعرضها، وده اللي بيعمله الكومبوننت ده.
 */
export default function AttachmentThumb({
  attachment, icon: Icon,
}: { attachment: any; icon: typeof FileText }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const isImage = attachment.mimeType?.startsWith('image/');

  useEffect(() => {
    let revoke: string | null = null;
    if (isImage) {
      attachmentsApi.fetchFileBlobUrl(attachment.url).then((url) => {
        revoke = url;
        setBlobUrl(url);
      }).catch(() => {});
    }
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [attachment.url, isImage]);

  const handleOpen = async () => {
    try {
      const url = blobUrl || (await attachmentsApi.fetchFileBlobUrl(attachment.url));
      window.open(url, '_blank', 'noopener');
    } catch {
      // تجاهل — لو فشل التحميل مفيش حاجة تتفتح
    }
  };

  return (
    <button
      onClick={handleOpen}
      className="flex items-center gap-3 border border-ink-100 rounded-lg p-3.5 hover:border-brand-200 transition-colors text-right"
    >
      <div className="w-10 h-10 rounded-lg bg-ink-50 flex items-center justify-center shrink-0 text-brand-600 overflow-hidden">
        {isImage && blobUrl ? (
          <img src={blobUrl} alt={attachment.name} className="w-full h-full object-cover" />
        ) : (
          <Icon size={18} />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink-800 truncate">{attachment.name}</p>
        <p className="text-xs text-ink-400 mt-0.5">{attachment.type}</p>
      </div>
    </button>
  );
}
