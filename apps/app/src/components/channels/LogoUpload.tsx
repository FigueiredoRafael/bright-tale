'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Upload, X, Loader2 } from 'lucide-react';
import { ChannelLogo } from './ChannelLogo';
import { invalidateChannelCache } from '@/hooks/use-active-channel';

interface LogoUploadProps {
  channelId: string;
  channelName: string;
  currentLogoUrl: string | null;
  onUploaded: (url: string) => void;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip "data:image/png;base64," prefix
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function LogoUpload({ channelId, channelName, currentLogoUrl, onUploaded }: LogoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Imagem muito grande (max 5MB)');
      return;
    }

    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch(`/api/channels/${channelId}/logo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          dataBase64: base64,
        }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error.message);
        return;
      }
      invalidateChannelCache();
      toast.success('Logo atualizado');
      onUploaded(json.data.url);
    } catch {
      toast.error('Falha no upload');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function removeLogo() {
    try {
      const res = await fetch(`/api/channels/${channelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logoUrl: null }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error.message);
        return;
      }
      invalidateChannelCache();
      toast.success('Logo removido');
      onUploaded('');
    } catch {
      toast.error('Falha ao remover');
    }
  }

  return (
    <div className="flex items-center gap-4">
      <ChannelLogo logoUrl={currentLogoUrl} name={channelName} size="lg" />
      <div className="flex flex-col gap-1.5">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Enviando...</>
          ) : (
            <><Upload className="h-3.5 w-3.5 mr-2" /> {currentLogoUrl ? 'Trocar logo' : 'Upload logo'}</>
          )}
        </Button>
        {currentLogoUrl && (
          <Button type="button" variant="ghost" size="sm" onClick={removeLogo} className="text-destructive">
            <X className="h-3.5 w-3.5 mr-2" /> Remover
          </Button>
        )}
        <p className="text-[10px] text-muted-foreground">PNG, JPG ou WebP. Max 5MB.</p>
      </div>
    </div>
  );
}
