/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { repository } from '../services/repository';

/**
 * Đọc tham số số bản ghi mỗi trang từ cấu hình hệ thống (mặc định 15)
 * và tự động cập nhật khi Quản trị viên thay đổi cấu hình.
 */
export function usePaginationPageSize(): number {
  const [pageSize, setPageSize] = useState<number>(() => repository.getPaginationPageSize());

  useEffect(() => {
    setPageSize(repository.getPaginationPageSize());
    return repository.subscribe(() => {
      setPageSize(repository.getPaginationPageSize());
    });
  }, []);

  return pageSize;
}

export interface UsePaginationResult<T> {
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  pageItems: T[];
  shouldPaginate: boolean;
}

/**
 * Hook phân trang chuẩn toàn hệ thống.
 * Chỉ kích hoạt phân trang khi tổng số bản ghi vượt quá `pageSize` (mặc định 15).
 */
export function usePagination<T>(
  items: T[],
  resetKey?: string | number,
  overridePageSize?: number
): UsePaginationResult<T> {
  const systemPageSize = usePaginationPageSize();
  const pageSize = Math.max(1, overridePageSize ?? systemPageSize);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Reset về trang 1 khi thay đổi điều kiện lọc / tìm kiếm / kích thước trang
  useEffect(() => {
    setCurrentPage(1);
  }, [resetKey, pageSize]);

  // Tự động giữ trang hợp lệ nếu danh sách bị thu gọn
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = totalItems === 0 ? 0 : (safePage - 1) * pageSize;
  const endIndex = Math.min(totalItems, startIndex + pageSize);

  const pageItems = useMemo(() => {
    if (totalItems <= pageSize) return items;
    return items.slice(startIndex, endIndex);
  }, [items, totalItems, pageSize, startIndex, endIndex]);

  return {
    currentPage: safePage,
    setCurrentPage,
    pageSize,
    totalItems,
    totalPages,
    startIndex,
    endIndex,
    pageItems,
    shouldPaginate: totalItems > pageSize,
  };
}

interface PaginationBarProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  startIndex: number;
  endIndex: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
  compact?: boolean;
  className?: string;
}

function buildPageNumbers(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: (number | 'ellipsis')[] = [1];
  const left = Math.max(2, currentPage - 1);
  const right = Math.min(totalPages - 1, currentPage + 1);

  if (left > 2) pages.push('ellipsis');
  for (let p = left; p <= right; p += 1) {
    pages.push(p);
  }
  if (right < totalPages - 1) pages.push('ellipsis');
  pages.push(totalPages);
  return pages;
}

/**
 * Thanh điều hướng phân trang responsive.
 * Chỉ hiển thị khi tổng số bản ghi vượt quá tham số phân trang (totalItems > pageSize).
 */
export const PaginationBar: React.FC<PaginationBarProps> = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  startIndex,
  endIndex,
  onPageChange,
  itemLabel = 'bản ghi',
  compact = false,
  className = '',
}) => {
  if (totalItems <= pageSize || totalPages <= 1) {
    return null;
  }

  const pageNumbers = buildPageNumbers(currentPage, totalPages);

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-t border-[#dce8f7] bg-[#f8fbff] ${
        compact ? 'px-3 py-2.5 text-[11px]' : 'px-4 py-3 text-xs'
      } ${className}`}
      role="navigation"
      aria-label="Phân trang danh sách"
    >
      <div className="text-[#476085] font-medium tabular-nums text-center sm:text-left">
        Hiển thị{' '}
        <strong className="text-[#07244d] font-extrabold">
          {startIndex + 1}–{endIndex}
        </strong>{' '}
        / <strong className="text-[#07244d] font-extrabold">{totalItems}</strong> {itemLabel}{' '}
        <span className="hidden sm:inline text-[#647da3]">({pageSize}/trang)</span>
      </div>

      <div className="flex items-center justify-center sm:justify-end gap-1 flex-wrap tabular-nums">
        {!compact && (
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(1)}
            aria-label="Trang đầu"
            title="Trang đầu"
            className="hidden sm:inline-flex items-center justify-center min-w-[34px] min-h-[34px] px-2 rounded-lg border border-[#cfe0f5] bg-white text-[#1e3a5f] hover:bg-[#edf4fe] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          aria-label="Trang trước"
          className={`inline-flex items-center justify-center gap-1 rounded-lg border border-[#cfe0f5] bg-white text-[#1e3a5f] hover:bg-[#edf4fe] disabled:opacity-40 disabled:cursor-not-allowed font-bold transition cursor-pointer ${
            compact ? 'min-h-[32px] px-2 text-[11px]' : 'min-h-[36px] px-2.5 text-xs'
          }`}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span className={compact ? 'sr-only' : 'hidden xs:inline sm:inline'}>Trước</span>
        </button>

        {/* Số trang gọn trên mobile */}
        <span className="sm:hidden px-2.5 py-1 rounded-lg bg-white border border-[#cfe0f5] text-[#07244d] font-extrabold text-xs">
          {currentPage} / {totalPages}
        </span>

        {/* Dãy nút số trang trên tablet/desktop */}
        <div className="hidden sm:flex items-center gap-1">
          {pageNumbers.map((item, idx) =>
            item === 'ellipsis' ? (
              <span
                key={`ellipsis-${idx}`}
                className="px-1.5 text-[#647da3] font-bold select-none"
              >
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                aria-current={item === currentPage ? 'page' : undefined}
                className={`inline-flex items-center justify-center rounded-lg border font-extrabold transition cursor-pointer ${
                  compact ? 'min-w-[30px] min-h-[30px] px-2 text-[11px]' : 'min-w-[34px] min-h-[34px] px-2.5 text-xs'
                } ${
                  item === currentPage
                    ? 'bg-[#0d62e8] text-white border-[#0d62e8] shadow-xs'
                    : 'bg-white text-[#1e3a5f] border-[#cfe0f5] hover:bg-[#edf4fe]'
                }`}
              >
                {item}
              </button>
            )
          )}
        </div>

        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          aria-label="Trang sau"
          className={`inline-flex items-center justify-center gap-1 rounded-lg border border-[#cfe0f5] bg-white text-[#1e3a5f] hover:bg-[#edf4fe] disabled:opacity-40 disabled:cursor-not-allowed font-bold transition cursor-pointer ${
            compact ? 'min-h-[32px] px-2 text-[11px]' : 'min-h-[36px] px-2.5 text-xs'
          }`}
        >
          <span className={compact ? 'sr-only' : 'hidden xs:inline sm:inline'}>Sau</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        {!compact && (
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(totalPages)}
            aria-label="Trang cuối"
            title="Trang cuối"
            className="hidden sm:inline-flex items-center justify-center min-w-[34px] min-h-[34px] px-2 rounded-lg border border-[#cfe0f5] bg-white text-[#1e3a5f] hover:bg-[#edf4fe] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
