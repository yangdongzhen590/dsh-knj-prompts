/**
 * dsh-knj-prompts 客户端样式：宿主令牌驱动（--dsw-alias-* / --dsw-static-*），
 * 全部选择器以 .knj-p 为根作用域（避免与 dsh-knj-obsidian 的 .knj-* 撞名）。
 */
export const PROMPT_CSS = /* css */ `
.knj-p {
  --p-accent: var(--dsw-alias-brand-primary-new-color, #5686fe);
  --p-bg-1: var(--dsw-alias-bg-layer-1, #232324);
  --p-bg-2: var(--dsw-alias-bg-layer-2, #2c2c2e);
  --p-border: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
  --p-border-soft: var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.06));
  --p-text: var(--dsw-alias-label-primary, #f9fafb);
  --p-text-2: var(--dsw-alias-label-secondary, #adb2b8);
  --p-text-3: var(--dsw-alias-label-tertiary, #81858c);
  --p-hover: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08));
  --p-active: var(--dsw-alias-interactive-bg-active, rgba(255, 255, 255, 0.14));
  --p-success: var(--dsw-alias-state-success-primary, #22c55e);
  --p-error: var(--dsw-alias-state-error-primary, #f25a5a);
  --p-radius: 8px;
  font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif);
  font-size: 13px;
  line-height: 20px;
  color: var(--p-text);
  box-sizing: border-box;
}
.knj-p *, .knj-p *::before, .knj-p *::after { box-sizing: border-box; }
.knj-p button, .knj-p input, .knj-p select, .knj-p textarea { font-family: inherit; }

/* 按钮 */
.knj-p .p-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border: 1px solid transparent; border-radius: var(--p-radius);
  padding: 5px 10px; font-size: 12px; line-height: 18px; font-weight: 500;
  color: var(--p-text-2); background: transparent; cursor: pointer;
  white-space: nowrap; user-select: none;
  transition: background .12s ease, color .12s ease, opacity .12s ease;
}
.knj-p .p-btn:hover:not(:disabled) { background: var(--p-hover); color: var(--p-text); }
.knj-p .p-btn:focus-visible { outline: 2px solid color-mix(in srgb, var(--p-accent) 55%, transparent); outline-offset: 1px; }
.knj-p .p-btn:disabled { opacity: .4; cursor: not-allowed; }
.knj-p .p-btn--primary { background: var(--p-accent); color: #fff; }
.knj-p .p-btn--primary:hover:not(:disabled) { background: var(--p-accent); filter: brightness(1.1); color: #fff; }
.knj-p .p-btn--sm { padding: 3px 8px; font-size: 12px; line-height: 16px; }
.knj-p .p-btn--danger { color: var(--p-error); }
.knj-p .p-btn--danger:hover:not(:disabled) { background: color-mix(in srgb, var(--p-error) 12%, transparent); color: var(--p-error); }

/* 输入 */
.knj-p .p-input, .knj-p .p-textarea {
  width: 100%; background: var(--p-bg-2); color: var(--p-text);
  border: 1px solid var(--p-border); border-radius: var(--p-radius);
  padding: 6px 10px; font-size: 13px; line-height: 20px; outline: none;
  transition: border-color .12s ease, box-shadow .12s ease;
}
.knj-p .p-textarea { resize: vertical; min-height: 80px; font-family: inherit; }
.knj-p .p-input::placeholder, .knj-p .p-textarea::placeholder { color: var(--p-text-3); }
.knj-p .p-input:focus, .knj-p .p-textarea:focus {
  border-color: var(--p-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--p-accent) 25%, transparent);
}

/* 下拉菜单（加大：更宽更高；操作条 sticky 固定在底部不随列表滚动） */
.knj-p .p-menu {
  position: absolute; z-index: 60; min-width: 300px; width: min(560px, calc(100vw - 32px));
  max-height: min(640px, calc(100vh - 120px)); overflow-y: auto;
  background: var(--p-bg-1); border: 1px solid var(--p-border); border-radius: 12px;
  box-shadow: var(--dsw-shadow-lv3, 0 12px 32px rgba(0, 0, 0, 0.2));
  padding: 6px; display: flex; flex-direction: column; gap: 2px;
  animation: p-pop-in .14s ease;
}
@keyframes p-pop-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
.knj-p .p-menu-item {
  display: flex; flex-direction: column; gap: 2px; padding: 7px 10px; border-radius: 8px;
  cursor: pointer; text-align: left; border: none; background: transparent; color: var(--p-text);
  transition: background .1s ease;
}
.knj-p .p-menu-item:hover { background: var(--p-hover); }
.knj-p .p-menu-item--busy { opacity: .55; cursor: wait; pointer-events: none; }
.knj-p .p-menu-item__name { font-size: 13px; font-weight: 500; color: var(--p-text); display: flex; align-items: center; gap: 6px; }
.knj-p .p-menu-item__desc { font-size: 11px; color: var(--p-text-3); }
.knj-p .p-menu-sep { height: 1px; background: var(--p-border-soft); margin: 4px 2px; }

/* 表单 / modal（三段式：固定头部 + 独立滚动内容区 + 固定底部操作栏） */
.knj-p .p-modal-mask { position: fixed; inset: 0; z-index: 70; background: rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; }
.knj-p .p-modal {
  width: min(1120px, calc(100vw - 48px)); height: min(900px, calc(100vh - 48px)); max-height: calc(100vh - 48px);
  background: var(--p-bg-1); border: 1px solid var(--p-border); border-radius: 14px;
  box-shadow: var(--dsw-shadow-lv3, 0 12px 32px rgba(0, 0, 0, 0.2));
  padding: 18px; display: flex; flex-direction: column; gap: 12px;
}
.knj-p .p-modal-head { display: flex; align-items: center; justify-content: space-between; flex: none; }
.knj-p .p-modal-body {
  flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
  display: flex; flex-direction: column; gap: 8px; padding: 2px 2px 4px;
}
.knj-p .p-modal-foot {
  flex: none; display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding-top: 10px; border-top: 1px solid var(--p-border-soft);
}
.knj-p .p-form-row { display: flex; flex-direction: column; gap: 4px; }
.knj-p .p-form-label { font-size: 12px; font-weight: 500; color: var(--p-text-2); }
.knj-p .p-modal-title { font-size: 16px; font-weight: 600; color: var(--p-text); margin: 0; }
.knj-p .p-banner { display: flex; align-items: flex-start; gap: 8px; padding: 8px 12px; border-radius: var(--p-radius); font-size: 12px; line-height: 18px; }
.knj-p .p-banner--ok { color: var(--p-success); background: color-mix(in srgb, var(--p-success) 12%, transparent); }
.knj-p .p-banner--err { color: var(--p-error); background: color-mix(in srgb, var(--p-error) 12%, transparent); }
.knj-p .p-row { display: flex; align-items: center; gap: 8px; }

/* ===== Task 4: ScenePicker ===== */
.knj-p .p-anchor { position: relative; display: inline-flex; }
.knj-p .p-btn--on { background: var(--p-active); color: var(--p-text); }
.knj-p .p-chev { transition: transform .12s ease; }
.knj-p .p-chev--up { transform: rotate(180deg); }
.knj-p .p-pop { min-width: 300px; }
.knj-p .p-file-input { position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.knj-p .p-menu-item:disabled { opacity: .55; cursor: wait; }
.knj-p .p-empty { padding: 14px 12px; color: var(--p-text-3); text-align: center; }
.knj-p .p-empty-inline { font-style: normal; color: var(--p-text-3); }
.knj-p .p-menu-foot { position: sticky; bottom: 0; z-index: 1; display: flex; justify-content: flex-end; padding: 6px 4px 2px; background: var(--p-bg-1); border-top: 1px solid var(--p-border-soft); margin-top: 2px; }
.knj-p .p-pagination { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 4px; font-size: 11px; color: var(--p-text-3); }
.knj-p .p-pagination__actions { display: flex; gap: 4px; }
.knj-p .p-star { margin-left: auto; border: none; background: transparent; color: var(--p-text-3); cursor: pointer; padding: 2px; display: inline-flex; }
.knj-p .p-star:hover { background: var(--p-hover); color: var(--p-text); }
.knj-p .p-star--on { color: var(--p-accent); fill: currentColor; }
.knj-p .p-star--on:hover { color: var(--p-accent); }
.knj-p .p-tag {
  font-size: 10px; line-height: 14px; padding: 0 5px; border-radius: 4px; flex: none;
  background: color-mix(in srgb, var(--p-accent) 14%, transparent); color: var(--p-accent);
}
.knj-p .p-vars { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 2px; font-size: 11px; color: var(--p-text-3); }
.knj-p .p-var {
  font-size: 10px; line-height: 16px; padding: 0 6px; border-radius: 4px;
  background: var(--p-bg-2); border: 1px solid var(--p-border-soft); color: var(--p-text-2);
  font-family: var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
}
.knj-p .p-fill-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 6px 8px; }
.knj-p .p-fill-title { font-size: 12px; font-weight: 600; color: var(--p-text-2); }
.knj-p .p-fill-body { display: flex; flex-direction: column; gap: 8px; padding: 0 2px; }
.knj-p .p-preview {
  white-space: pre-wrap; font-size: 12px; line-height: 18px; color: var(--p-text-2);
  background: var(--p-bg-2); border: 1px dashed var(--p-border); border-radius: var(--p-radius);
  padding: 8px 10px; max-height: 140px; overflow: auto;
}
.knj-p .p-fill-foot { display: flex; justify-content: flex-end; gap: 8px; padding-top: 10px; }
.knj-p .p-hint { font-size: 11px; line-height: 16px; color: var(--p-text-3); }
.knj-p .p-operation-manual { display: flex; flex-direction: column; gap: 8px; padding: 8px 10px; border: 1px solid var(--p-border-soft); border-radius: var(--p-radius); }
.knj-p .p-operation-manual > summary { cursor: pointer; font-size: 12px; font-weight: 500; color: var(--p-text-2); }
.knj-p .p-operation-manual__input { min-height: 140px; }
.knj-p .p-modal-head { display: flex; align-items: center; justify-content: space-between; flex: none; }
.knj-p .p-manage-list { display: flex; flex-direction: column; gap: 4px; }
.knj-p .p-manage-row {
  display: flex; align-items: center; gap: 8px; padding: 8px 10px;
  border-radius: 8px; background: var(--p-bg-2); border: 1px solid var(--p-border-soft);
}
.knj-p .p-manage-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.knj-p .p-manage-name { font-size: 13px; font-weight: 500; color: var(--p-text); display: flex; align-items: center; gap: 6px; }
.knj-p .p-manage-desc { font-size: 11px; color: var(--p-text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.knj-p .p-manage-actions { display: flex; gap: 2px; flex: none; }
.knj-p .p-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--p-border-soft); padding-bottom: 8px; flex: none; }
.knj-p .p-tab {
  border: 1px solid transparent; border-radius: 6px; padding: 4px 14px;
  font-size: 12px; line-height: 18px; color: var(--p-text-2); background: transparent; cursor: pointer;
  transition: background .12s ease, color .12s ease;
}
.knj-p .p-tab:hover { background: var(--p-hover); color: var(--p-text); }
.knj-p .p-tab--on { background: var(--p-active); color: var(--p-text); }
.knj-p .p-search { margin-bottom: 4px; flex: none; }
.knj-p .p-combo { position: relative; }
.knj-p .p-combo-pop {
  z-index: 80; max-height: 220px; overflow: auto;
  background: var(--p-bg-1); border: 1px solid var(--p-border); border-radius: 8px;
  box-shadow: var(--dsw-shadow-lv3, 0 12px 32px rgba(0, 0, 0, 0.2));
  padding: 4px; display: flex; flex-direction: column; gap: 2px;
}
.knj-p .p-combo-item {
  display: flex; align-items: baseline; gap: 6px; text-align: left; padding: 6px 10px;
  border-radius: 6px; border: none; background: transparent; color: var(--p-text);
  cursor: pointer; font-size: 12px; line-height: 18px; white-space: nowrap;
}
.knj-p .p-combo-item:hover { background: var(--p-hover); }
.knj-p .p-combo-item__name { font-weight: 500; color: var(--p-text); }
.knj-p .p-combo-item__val { color: var(--p-text-3); overflow: hidden; text-overflow: ellipsis; }
`

/** 注入样式（幂等）：client apply 时调用。 */
export function injectPromptStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById('dsh-knj-prompts-styles')) return
  const style = document.createElement('style')
  style.id = 'dsh-knj-prompts-styles'
  style.setAttribute('data-plugin', 'dsh-knj-prompts')
  style.textContent = PROMPT_CSS
  document.head.appendChild(style)
}

/** 移除注入样式（幂等）：插件卸载/HMR 时调用，避免旧版本样式常驻 DOM。 */
export function removePromptStyles(): void {
  if (typeof document === 'undefined') return
  document.getElementById('dsh-knj-prompts-styles')?.remove()
}
