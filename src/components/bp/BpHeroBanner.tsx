/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import bpBannerArt from '../../assets/images/bp_lyson_hero_clean_1795353098095.jpg';
import bpEmblemImg from '../../assets/images/bp_border_guard_emblem_1795353063653.jpg';

interface BpHeroBannerProps {
  kicker: string;
  title: string;
  subtitleNode?: React.ReactNode;
  rightAction?: React.ReactNode;
}

export const BpHeroBanner: React.FC<BpHeroBannerProps> = ({
  kicker,
  title,
  subtitleNode,
  rightAction,
}) => {
  return (
    <section className="relative overflow-hidden rounded-[20px] border border-[#c8dffb] bg-[linear-gradient(90deg,#edf6ff_0%,#f1f8ff_44%,#d8ecff_64%,#89cbf9_84%,#60b7f5_100%)] shadow-[0_10px_28px_-14px_rgba(12,86,192,0.28)] px-4 py-4 sm:px-6 sm:py-5">
      {/* Minh họa tàu tuần tra Biên phòng & đảo Lý Sơn ở nửa phải */}
      <div
        className="hidden md:block absolute inset-y-0 right-0 w-[56%] lg:w-[54%] pointer-events-none select-none overflow-hidden"
        aria-hidden="true"
      >
        <img
          src={bpBannerArt}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute right-0 lg:right-12 xl:right-20 top-1/2 -translate-y-[49%] h-[126%] w-auto max-w-none object-contain [mask-image:linear-gradient(to_right,transparent_0%,black_28%,black_88%,transparent_100%)]"
        />
        {/* Lớp chuyển sắc mượt nối với nền chữ bên trái */}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#f0f7ff_0%,rgba(240,247,255,0.88)_14%,rgba(240,247,255,0.22)_32%,rgba(240,247,255,0)_52%)]" />
      </div>

      {/* Đường sóng chân banner nhẹ */}
      <div
        className="hidden md:block absolute inset-x-0 bottom-0 h-1 bg-[linear-gradient(90deg,rgba(13,98,232,0.12)_0%,rgba(13,98,232,0.28)_60%,rgba(2,132,199,0.4)_100%)] pointer-events-none"
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 max-w-2xl">
          {/* Biểu trưng Bộ đội Biên phòng */}
          <div className="w-14 h-14 sm:w-[70px] sm:h-[70px] rounded-full bg-white p-0.5 shadow-[0_4px_14px_rgba(7,36,86,0.18)] ring-2 ring-white/90 shrink-0 overflow-hidden flex items-center justify-center">
            <img
              src={bpEmblemImg}
              alt="Biểu trưng Đồn Biên phòng Lý Sơn"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover rounded-full"
            />
          </div>

          <div className="min-w-0">
            <p className="text-[11px] sm:text-xs font-extrabold uppercase tracking-wide text-[#0b5ed7] leading-snug">
              {kicker}
            </p>
            <h1 className="text-lg sm:text-2xl lg:text-[26px] font-extrabold text-[#072456] tracking-tight leading-tight mt-0.5 text-balance">
              {title}
            </h1>
            {subtitleNode && (
              <div className="mt-1.5 text-xs font-semibold text-[#294978] flex flex-wrap items-center gap-x-2.5 gap-y-1">
                {subtitleNode}
              </div>
            )}
          </div>
        </div>

        {rightAction && <div className="shrink-0 flex items-center">{rightAction}</div>}
      </div>
    </section>
  );
};
