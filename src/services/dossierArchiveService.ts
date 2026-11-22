/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IncomingDossier, TripRecord } from '../types';
import { sessionManager } from './sessionManager';
import { fileStorageService } from './fileStorageService';

export type ServerDossierSubFolder = 'giay-to' | 'lenh-cap-phep';

export interface ServerArchivedFile {
  id: string;
  subFolder: ServerDossierSubFolder;
  storedFileName: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  relativePath: string;
  downloadUrl: string;
  category?: string;
  categoryName?: string;
  docId?: string;
  note?: string;
  uploadedAt: string;
  uploadedByName?: string;
}

export interface ServerDossierManifest {
  tripNumber: string;
  tripId?: string;
  vesselName?: string;
  vesselRegNumber?: string;
  orderNumber?: string;
  status?: string;
  folderName: string;
  createdAt: string;
  updatedAt: string;
  lastSyncedBy?: string;
  files: ServerArchivedFile[];
}

export interface ServerDossierDetails {
  tripNumber: string;
  folderName: string;
  storageRoot: string;
  folderPath: string;
  exists: boolean;
  manifest: ServerDossierManifest | null;
  hasTripJson: boolean;
  hasIncomingDossierJson: boolean;
  hasOrderInfoJson: boolean;
  files: ServerArchivedFile[];
  totalSizeBytes: number;
}

export interface ServerDossierSummaryItem {
  tripNumber: string;
  folderName: string;
  tripId?: string;
  vesselName?: string;
  vesselRegNumber?: string;
  orderNumber?: string;
  status?: string;
  filesCount: number;
  documentsCount: number;
  ordersCount: number;
  totalSizeBytes: number;
  updatedAt: string;
}

export interface ServerDossiersOverview {
  storageRoot: string;
  totalFolders: number;
  totalFiles: number;
  totalSizeBytes: number;
  dossiers: ServerDossierSummaryItem[];
}

function buildAuthHeaders(isMutation = false): Record<string, string> {
  const headers: Record<string, string> = {
    ...sessionManager.getSessionHeaders(),
  };
  if (isMutation) {
    headers['Content-Type'] = 'application/json';
    headers['X-Requested-With'] = 'XMLHttpRequest';
  }
  return headers;
}

function blobToBase64DataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Không thể chuyển đổi tệp để tải lên máy chủ.'));
      }
    };
    reader.onerror = () => reject(new Error('Lỗi đọc dữ liệu tệp.'));
    reader.readAsDataURL(blob);
  });
}

const pendingSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const dossierArchiveService = {
  /**
   * Liệt kê toàn bộ thư mục hồ sơ (theo mã hồ sơ) đang lưu trên Server
   */
  async listServerDossiers(): Promise<ServerDossiersOverview | null> {
    try {
      const res = await fetch('/api/dossiers', {
        method: 'GET',
        credentials: 'include',
        headers: buildAuthHeaders(false),
      });
      if (res.status === 401) {
        sessionManager.handleUnauthorizedResponse();
        return null;
      }
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.success) return null;
      return {
        storageRoot: data.storageRoot,
        totalFolders: data.totalFolders,
        totalFiles: data.totalFiles,
        totalSizeBytes: data.totalSizeBytes,
        dossiers: Array.isArray(data.dossiers) ? data.dossiers : [],
      };
    } catch {
      return null;
    }
  },

  /**
   * Lấy thông tin chi tiết thư mục và danh sách tệp của một hồ sơ theo mã hồ sơ
   */
  async getDossierArchive(tripNumber: string): Promise<ServerDossierDetails | null> {
    if (!tripNumber?.trim()) return null;
    try {
      const res = await fetch(`/api/dossiers/${encodeURIComponent(tripNumber.trim())}`, {
        method: 'GET',
        credentials: 'include',
        headers: buildAuthHeaders(false),
      });
      if (res.status === 401) {
        sessionManager.handleUnauthorizedResponse();
        return null;
      }
      if (!res.ok) return null;
      const data = await res.json();
      return data?.success && data?.dossier ? (data.dossier as ServerDossierDetails) : null;
    } catch {
      return null;
    }
  },

  /**
   * Tải tệp dạng DataURL / Base64 vào thư mục con `giay-to` hoặc `lenh-cap-phep` của hồ sơ trên Server
   */
  async uploadDataUrlToDossier(
    tripNumber: string,
    subFolder: ServerDossierSubFolder,
    params: {
      fileName: string;
      dataUrlOrBase64: string;
      mimeType?: string;
      category?: string;
      categoryName?: string;
      docId?: string;
      note?: string;
      uploadedByName?: string;
      overwriteSameName?: boolean;
    }
  ): Promise<ServerArchivedFile> {
    const cleanCode = tripNumber?.trim();
    if (!cleanCode) {
      throw new Error('Thiếu mã hồ sơ để lưu tệp trên Server.');
    }

    const res = await fetch(`/api/dossiers/${encodeURIComponent(cleanCode)}/files`, {
      method: 'POST',
      credentials: 'include',
      headers: buildAuthHeaders(true),
      body: JSON.stringify({
        subFolder,
        fileName: params.fileName,
        contentBase64: params.dataUrlOrBase64,
        mimeType: params.mimeType,
        category: params.category,
        categoryName: params.categoryName,
        docId: params.docId,
        note: params.note,
        uploadedByName: params.uploadedByName,
        overwriteSameName: params.overwriteSameName ?? false,
      }),
    });

    if (res.status === 401) {
      sessionManager.handleUnauthorizedResponse();
      throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tải tệp lên Server.');
    }

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success || !data?.file) {
      throw new Error(data?.message || data?.error || 'Không thể lưu tệp vào thư mục hồ sơ trên Server.');
    }
    return data.file as ServerArchivedFile;
  },

  /**
   * Tải File hoặc Blob trực tiếp lên thư mục hồ sơ trên Server
   */
  async uploadBlobToDossier(
    tripNumber: string,
    subFolder: ServerDossierSubFolder,
    fileOrBlob: Blob,
    params: {
      fileName: string;
      mimeType?: string;
      category?: string;
      categoryName?: string;
      docId?: string;
      note?: string;
      uploadedByName?: string;
      overwriteSameName?: boolean;
    }
  ): Promise<ServerArchivedFile> {
    const dataUrl = await blobToBase64DataUrl(fileOrBlob);
    return this.uploadDataUrlToDossier(tripNumber, subFolder, {
      ...params,
      dataUrlOrBase64: dataUrl,
      mimeType: params.mimeType || fileOrBlob.type,
    });
  },

  /**
   * Đồng bộ dữ liệu hồ sơ chuyến + các giấy tờ đã lưu cục bộ (nếu chưa đẩy lên server) vào `<root>/<mã_hồ_sơ>/`
   */
  async syncTripToServer(
    trip: TripRecord,
    options?: {
      incomingDossier?: IncomingDossier | null;
      actorName?: string;
      syncPendingAttachments?: boolean;
    }
  ): Promise<{ dossier: ServerDossierDetails | null; uploadedCount: number }> {
    const cleanCode = trip.tripNumber?.trim();
    if (!cleanCode) {
      return { dossier: null, uploadedCount: 0 };
    }

    let uploadedCount = 0;

    if (options?.syncPendingAttachments !== false && Array.isArray(trip.uploadedDocuments)) {
      for (const doc of trip.uploadedDocuments) {
        if (doc.serverUrl) continue;
        if (!doc.storageKey && !doc.previewUrl) continue;
        try {
          const dataUrl = await fileStorageService.resolveFileDataUrl(doc.storageKey, doc.previewUrl);
          if (!dataUrl || !dataUrl.startsWith('data:')) continue;
          const saved = await this.uploadDataUrlToDossier(cleanCode, 'giay-to', {
            fileName: doc.fileName || `${doc.id}.pdf`,
            dataUrlOrBase64: dataUrl,
            mimeType: doc.mimeType,
            category: doc.category,
            categoryName: doc.categoryName,
            docId: doc.id,
            note: doc.note,
            uploadedByName: options?.actorName,
            overwriteSameName: true,
          });
          doc.serverUrl = saved.downloadUrl;
          doc.serverPath = saved.relativePath;
          doc.serverStoredName = saved.storedFileName;
          uploadedCount += 1;
        } catch {
          // Tiếp tục đồng bộ phần JSON dù một tệp đính kèm gặp lỗi
        }
      }
    }

    const res = await fetch(`/api/dossiers/${encodeURIComponent(cleanCode)}/sync`, {
      method: 'POST',
      credentials: 'include',
      headers: buildAuthHeaders(true),
      body: JSON.stringify({
        trip,
        incomingDossier: options?.incomingDossier ?? null,
        actorName: options?.actorName,
      }),
    });

    if (res.status === 401) {
      return { dossier: null, uploadedCount };
    }

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.message || data?.error || 'Không thể đồng bộ hồ sơ lên Server.');
    }

    return {
      dossier: (data.dossier as ServerDossierDetails) || null,
      uploadedCount,
    };
  },

  /**
   * Tự động lưu trọn bộ hồ sơ & Giấy phép vào Server theo quy định lưu trữ (5 năm)
   * khi hồ sơ được duyệt dự thảo hoặc phát hành Giấy phép lên ứng dụng.
   */
  async archiveApprovedOrIssuedTrip(
    trip: TripRecord,
    options: {
      stage: 'DRAFT_APPROVED' | 'PERMIT_ISSUED';
      vessel?: import('../types').Vessel;
      incomingDossier?: IncomingDossier | null;
      actorName?: string;
      uploadedPermitFile?: File | null;
    }
  ): Promise<{
    success: boolean;
    folderPath?: string;
    permitPdfUrl?: string;
    permitPdfName?: string;
    permitPdfServerPath?: string;
    filesCount?: number;
    error?: string;
  }> {
    const cleanCode = trip.tripNumber?.trim();
    if (!cleanCode) {
      return { success: false, error: 'Thiếu mã hồ sơ để lưu trữ lên Server.' };
    }

    try {
      const { buildOrderWordDocument, buildPermitArchivePdfBlob } = await import(
        '../utils/exportUtils'
      );

      let permitPdfUrl = trip.issuedPdfUrl;
      let permitPdfName = trip.issuedPdfName;
      let permitPdfServerPath = trip.issuedPdfServerPath;

      // 1. Lưu bản Word (.doc) chính thức của dự thảo / giấy phép vào thư mục lenh-cap-phep/
      const wordDoc = buildOrderWordDocument(trip, options.vessel);
      const wordFileName =
        options.stage === 'PERMIT_ISSUED' && trip.orderNumber
          ? `Giay_Phep_Roi_Cang_${trip.orderNumber.replace(/[\/\\\s]+/g, '_')}.doc`
          : `Du_Thao_Giay_Phep_${cleanCode}.doc`;

      await this.uploadBlobToDossier(cleanCode, 'lenh-cap-phep', wordDoc.blob, {
        fileName: wordFileName,
        mimeType: 'application/msword',
        category: options.stage === 'PERMIT_ISSUED' ? 'ISSUED_ORDER_DOC' : 'DRAFT_ORDER_DOC',
        categoryName:
          options.stage === 'PERMIT_ISSUED'
            ? 'Giấy phép rời cảng (Word lưu trữ)'
            : 'Dự thảo Giấy phép đã duyệt (Word)',
        note:
          options.stage === 'PERMIT_ISSUED'
            ? `Tự động lưu trữ khi phát hành Giấy phép số ${trip.orderNumber || cleanCode}`
            : `Tự động lưu trữ khi duyệt dự thảo hồ sơ ${cleanCode}`,
        uploadedByName: options.actorName,
        overwriteSameName: true,
      });

      // 2. Khi phát hành Giấy phép: đảm bảo có tệp PDF thực tế được lưu trong lenh-cap-phep/ trên Server
      if (options.stage === 'PERMIT_ISSUED') {
        const alreadyOnServer = Boolean(
          permitPdfServerPath && permitPdfUrl && permitPdfUrl.startsWith('/api/dossiers/')
        );

        if (options.uploadedPermitFile && !alreadyOnServer) {
          const uploadedPdf = await this.uploadBlobToDossier(
            cleanCode,
            'lenh-cap-phep',
            options.uploadedPermitFile,
            {
              fileName: options.uploadedPermitFile.name,
              mimeType: options.uploadedPermitFile.type || 'application/pdf',
              category: 'ISSUED_ORDER_PDF',
              categoryName: 'Giấy phép rời cảng PDF đã ký số trên Office',
              note: `Tự động lưu trữ bản PDF phát hành số ${trip.orderNumber || cleanCode}`,
              uploadedByName: options.actorName,
              overwriteSameName: true,
            }
          );
          permitPdfUrl = uploadedPdf.downloadUrl;
          permitPdfName = uploadedPdf.originalFileName;
          permitPdfServerPath = uploadedPdf.relativePath;
        } else if (!alreadyOnServer) {
          const generatedPdf = buildPermitArchivePdfBlob(trip, options.vessel);
          const uploadedPdf = await this.uploadBlobToDossier(
            cleanCode,
            'lenh-cap-phep',
            generatedPdf.blob,
            {
              fileName: generatedPdf.fileName,
              mimeType: 'application/pdf',
              category: 'ISSUED_ORDER_PDF',
              categoryName: 'Giấy phép rời cảng (PDF lưu trữ điện tử)',
              note: `Tự động khởi tạo & lưu trữ PDF khi phát hành Giấy phép số ${trip.orderNumber || cleanCode}`,
              uploadedByName: options.actorName,
              overwriteSameName: true,
            }
          );
          permitPdfUrl = uploadedPdf.downloadUrl;
          permitPdfName = uploadedPdf.originalFileName;
          permitPdfServerPath = uploadedPdf.relativePath;
        }
      }

      // 3. Đồng bộ đầy đủ giấy tờ đính kèm (giay-to/) + JSON hồ sơ + thong-tin-lenh.json + manifest.json
      const tripToSync: TripRecord = {
        ...trip,
        issuedPdfUrl: permitPdfUrl,
        issuedPdfName: permitPdfName,
        issuedPdfServerPath: permitPdfServerPath,
      };
      const synced = await this.syncTripToServer(tripToSync, {
        incomingDossier: options.incomingDossier ?? null,
        actorName: options.actorName,
        syncPendingAttachments: true,
      });

      return {
        success: Boolean(synced.dossier),
        folderPath: synced.dossier
          ? `${synced.dossier.folderName}/lenh-cap-phep/`
          : `${cleanCode}/lenh-cap-phep/`,
        permitPdfUrl,
        permitPdfName,
        permitPdfServerPath,
        filesCount: synced.dossier?.files.length,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Không thể tự động lưu hồ sơ lên Server.',
      };
    }
  },

  /**
   * Đồng bộ nền không chặn giao diện mỗi khi hồ sơ chuyến thay đổi trạng thái/dữ liệu
   */
  queueTripSync(trip: TripRecord, incomingDossier?: IncomingDossier | null, actorName?: string): void {
    const cleanCode = trip?.tripNumber?.trim();
    if (!cleanCode || typeof window === 'undefined') return;
    // Chỉ đồng bộ nền nếu đã có phiên đăng nhập phía máy chủ hoặc cookie phiên
    const hasToken = Object.keys(sessionManager.getSessionHeaders()).length > 0;
    if (!hasToken) {
      // Vẫn thử nếu có cookie phiên (trường hợp cùng origin), nhưng debounced nhẹ
    }

    const existingTimer = pendingSyncTimers.get(cleanCode);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const snapshotTrip: TripRecord = JSON.parse(JSON.stringify(trip));
    const snapshotIncoming = incomingDossier ? JSON.parse(JSON.stringify(incomingDossier)) : null;

    const timer = setTimeout(() => {
      pendingSyncTimers.delete(cleanCode);
      void this.syncTripToServer(snapshotTrip, {
        incomingDossier: snapshotIncoming,
        actorName,
        syncPendingAttachments: true,
      }).catch(() => {
        // Bỏ qua lỗi đồng bộ nền để không gián đoạn thao tác ngoại tuyến
      });
    }, 450);

    pendingSyncTimers.set(cleanCode, timer);
  },

  /**
   * Xóa một tệp đã lưu trong thư mục hồ sơ trên Server
   */
  async deleteDossierFile(
    tripNumber: string,
    subFolder: ServerDossierSubFolder,
    storedFileName: string
  ): Promise<boolean> {
    const res = await fetch(
      `/api/dossiers/${encodeURIComponent(tripNumber)}/files/${subFolder}/${encodeURIComponent(storedFileName)}`,
      {
        method: 'DELETE',
        credentials: 'include',
        headers: buildAuthHeaders(true),
      }
    );
    if (res.status === 401) {
      sessionManager.handleUnauthorizedResponse();
      return false;
    }
    const data = await res.json().catch(() => null);
    return Boolean(res.ok && data?.success);
  },

  /**
   * Tải tệp từ Server kèm header xác thực phiên để xem trước hoặc tải về máy
   */
  async fetchServerFileAsDataUrl(serverUrl: string): Promise<string | null> {
    if (!serverUrl) return null;
    try {
      const res = await fetch(serverUrl, {
        method: 'GET',
        credentials: 'include',
        headers: buildAuthHeaders(false),
      });
      if (res.status === 401) {
        sessionManager.handleUnauthorizedResponse();
        return null;
      }
      if (!res.ok) return null;
      const blob = await res.blob();
      return await blobToBase64DataUrl(blob);
    } catch {
      return null;
    }
  },

  /**
   * Tải về máy trực tiếp một tệp được lưu trên Server (gửi kèm session header)
   */
  async downloadServerFile(serverUrl: string, fileName: string): Promise<boolean> {
    try {
      const res = await fetch(serverUrl, {
        method: 'GET',
        credentials: 'include',
        headers: buildAuthHeaders(false),
      });
      if (res.status === 401) {
        sessionManager.handleUnauthorizedResponse();
        return false;
      }
      if (!res.ok) return false;
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = fileName || 'ho-so-vrsb';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objUrl), 1500);
      return true;
    } catch {
      return false;
    }
  },
};
