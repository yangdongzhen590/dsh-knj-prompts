/**
 * ScenePicker：输入框工具行右侧的「提示词」下拉（Task 4）。
 *
 * 流程：选场景 →（提示词含 {变量} 时先弹填充面板）→ 当前会话是空白会话
 * 则直接 setDraft 填充草稿；否则经 workspaces.startSession() 切到同工作区
 * 的空白会话，由新会话挂载的本组件消费 pendingFill 完成填充；微调即可发送。
 * 宿主 API 结论见 PROBE.md。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchScenes, saveScenes } from './api.ts'
import { extractVariables, fillPrompt, resolveSceneAction, uniqueId, validateScene } from './engine.ts'
import { IconChevronDown, IconClose, IconPlus, IconSparkles, IconTrash } from './icons.tsx'
import type { Scene } from '../types.ts'

/** 挂起填充：跨会话切换传递待填文本（模块级，生命周期 = 页面）。 */
interface PendingFill { text: string; at: number }
let pendingFill: PendingFill | undefined
/** 挂起有效期：超时丢弃，避免 startSession 失败后误填之后手动新建的会话。 */
const PENDING_TTL_MS = 15_000

/** 宿主注入本组件的最小结构面（标准套件 + InputZone owner share）。 */
export interface ScenePickerProps {
  /** InputZone owner share：会话快照（blank=空日志）与输入机状态。 */
  session?: { blank?: boolean }
  input?: { draft?: string }
  /** 标准套件：inputActions.setDraft 是唯一公开草稿写通道。 */
  inputActions?: { setDraft(text: string): void }
  /** apply 闭包传入：workspaces.startSession = 官方「新建会话」动作。 */
  workspaces?: { startSession(workspaceId?: string): void }
}

/** 应用填充：决策见 engine.resolveSceneAction（空白→原地填；非空白→挂起并切新会话；无通道→兜底填当前）。 */
function applySceneText(props: ScenePickerProps, text: string): void {
  const action = resolveSceneAction(props.session?.blank === true, props.workspaces !== undefined)
  if (action === 'fill-here') {
    props.inputActions?.setDraft(text)
    return
  }
  pendingFill = { text, at: Date.now() }
  props.workspaces!.startSession()
}

export function ScenePicker(props: ScenePickerProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'menu' | 'fill'>('menu')
  const [manage, setManage] = useState(false)
  const [scenes, setScenes] = useState<Scene[] | null>(null) // null = 加载中
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [fillScene, setFillScene] = useState<Scene | null>(null)
  const [fillValues, setFillValues] = useState<Record<string, string>>({})
  const [pos, setPos] = useState<{ right: number; bottom: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  // 消费挂起填充：新空白会话挂载/重渲染时落地（TTL 内有效；幂等）
  useEffect(() => {
    if (!pendingFill) return
    if (Date.now() - pendingFill.at > PENDING_TTL_MS) {
      pendingFill = undefined
      return
    }
    if (props.session?.blank && props.inputActions) {
      const text = pendingFill.text
      pendingFill = undefined
      props.inputActions.setDraft(text)
    }
  })

  const load = useCallback(async () => {
    setScenes(null)
    setLoadErr(null)
    try {
      setScenes(await fetchScenes())
    } catch {
      setLoadErr('场景加载失败，请重试')
    }
  }, [])

  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    setMode('menu')
    setFillScene(null)
    const r = btnRef.current?.getBoundingClientRect()
    if (r) {
      // 菜单从按钮上方弹出（输入框位于窗口底部），右对齐按钮
      setPos({
        right: Math.max(8, window.innerWidth - r.right),
        bottom: Math.max(8, window.innerHeight - r.top + 6),
      })
    }
    setOpen(true)
    void load()
  }

  // 外点关闭 + Escape 关闭
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!btnRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (s: Scene) => {
    const vars = extractVariables(s.prompt)
    if (vars.length === 0) {
      applySceneText(props, s.prompt)
      setOpen(false)
      return
    }
    setFillScene(s)
    setFillValues(Object.fromEntries(vars.map((v) => [v, ''])))
    setMode('fill')
  }

  const confirmFill = () => {
    if (!fillScene) return
    applySceneText(props, fillPrompt(fillScene.prompt, fillValues))
    setOpen(false)
  }

  const inBlank = props.session?.blank === true

  return (
    <div className="knj-p p-anchor">
      <button
        ref={btnRef}
        type="button"
        className={open ? 'p-btn p-btn--sm p-btn--on' : 'p-btn p-btn--sm'}
        title="提示词场景"
        onClick={toggle}
      >
        <IconSparkles size={14} />
        <span>提示词</span>
        <IconChevronDown size={12} className={open ? 'p-chev p-chev--up' : 'p-chev'} />
      </button>

      {open && pos && (
        <div
          ref={popRef}
          className="p-menu p-pop"
          role="menu"
          style={{ position: 'fixed', right: `${pos.right}px`, bottom: `${pos.bottom}px` }}
        >
          {mode === 'menu'
            ? renderMenu(scenes, loadErr, () => void load(), pick, () => setManage(true))
            : null}
          {mode === 'fill' && fillScene
            ? renderFill(fillScene, fillValues, setFillValues, inBlank, () => setMode('menu'), confirmFill)
            : null}
        </div>
      )}

      {manage && (
        <ManageModal
          scenes={scenes ?? []}
          onClose={() => setManage(false)}
          onSaved={(next) => setScenes(next)}
        />
      )}
    </div>
  )
}

/** 下拉主面板：场景列表 + 管理入口。 */
function renderMenu(
  scenes: Scene[] | null,
  loadErr: string | null,
  retry: () => void,
  pick: (s: Scene) => void,
  openManage: () => void,
) {
  if (loadErr) {
    return (
      <>
        <div className="p-banner p-banner--err">{loadErr}</div>
        <div className="p-menu-foot">
          <button type="button" className="p-btn p-btn--sm" onClick={retry}>重试</button>
        </div>
      </>
    )
  }
  if (!scenes) return <div className="p-empty">加载场景中…</div>
  if (scenes.length === 0) {
    return (
      <>
        <div className="p-empty">还没有场景，先添加一个</div>
        <div className="p-menu-foot">
          <button type="button" className="p-btn p-btn--sm" onClick={openManage}>
            <IconPlus size={12} />
            <span>添加场景…</span>
          </button>
        </div>
      </>
    )
  }
  return (
    <>
      {scenes.map((s) => {
        const vars = extractVariables(s.prompt)
        return (
          <button key={s.id} type="button" className="p-menu-item" onClick={() => pick(s)}>
            <span className="p-menu-item__name">
              {s.name}
              {s.builtin ? <span className="p-tag">内置</span> : null}
            </span>
            {s.description ? <span className="p-menu-item__desc">{s.description}</span> : null}
            {vars.length > 0 ? (
              <span className="p-vars">
                {vars.map((v) => (
                  <code key={v} className="p-var">{`{${v}}`}</code>
                ))}
              </span>
            ) : null}
          </button>
        )
      })}
      <div className="p-menu-sep" />
      <div className="p-menu-foot">
        <button type="button" className="p-btn p-btn--sm" onClick={openManage}>
          <IconPlus size={12} />
          <span>管理场景…</span>
        </button>
      </div>
    </>
  )
}

/** 变量填充面板：逐变量输入 + 实时预览。 */
function renderFill(
  scene: Scene,
  values: Record<string, string>,
  setValues: (v: Record<string, string>) => void,
  inBlank: boolean,
  back: () => void,
  confirm: () => void,
) {
  const vars = extractVariables(scene.prompt)
  const preview = fillPrompt(scene.prompt, values)
  return (
    <>
      <div className="p-fill-head">
        <span className="p-fill-title">填充变量 · {scene.name}</span>
        <button type="button" className="p-btn p-btn--sm" title="返回列表" onClick={back}>
          <IconClose size={12} />
        </button>
      </div>
      <div className="p-fill-body">
        {vars.map((v) => (
          <label key={v} className="p-form-row">
            <span className="p-form-label">{`{${v}}`}</span>
            <input
              className="p-input"
              value={values[v] ?? ''}
              placeholder={v}
              spellCheck={false}
              onChange={(e) => setValues({ ...values, [v]: e.target.value })}
            />
          </label>
        ))}
        <div className="p-preview">{preview}</div>
      </div>
      <div className="p-fill-foot">
        <button type="button" className="p-btn p-btn--sm" onClick={back}>取消</button>
        <button type="button" className="p-btn p-btn--sm p-btn--primary" onClick={confirm}>
          {inBlank ? '填充到输入框' : '新会话并填充'}
        </button>
      </div>
    </>
  )
}

/** 新场景草稿（id 由保存时 uniqueId 生成）。 */
function newDraft(): Scene {
  return { id: '', name: '', description: '', prompt: '', builtin: false, updatedAt: '' }
}

/** 场景管理弹窗：新增 / 编辑 / 删除，保存全部（PUT 全量替换）。 */
function ManageModal({ scenes, onClose, onSaved }: {
  scenes: Scene[]
  onClose: () => void
  onSaved: (next: Scene[]) => void
}) {
  const [drafts, setDrafts] = useState<Scene[]>(() => scenes.map((s) => ({ ...s })))
  const [sel, setSel] = useState<string | 'new' | null>(null) // null=列表视图
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const editing: Scene | null =
    sel === null ? null : sel === 'new' ? newDraft() : (drafts.find((d) => d.id === sel) ?? null)

  const patch = (next: Scene) => {
    if (sel === null) return
    setDrafts((ds) => (sel === 'new' ? [...ds, next] : ds.map((d) => (d.id === sel ? next : d))))
    if (sel === 'new') setSel(null) // 新建草稿入列后回到列表
  }

  const remove = (id: string) => {
    setDrafts((ds) => ds.filter((d) => d.id !== id))
    if (sel === id) setSel(null)
  }

  const saveAll = async () => {
    const invalid = drafts.filter((d) => !validateScene(d))
    if (invalid.length > 0) {
      setBanner({ ok: false, text: `有 ${invalid.length} 个场景未填名称/提示词或 id 非法，请先修正` })
      return
    }
    setSaving(true)
    setBanner(null)
    try {
      const saved = await saveScenes(drafts)
      onSaved(saved)
      setDrafts(saved.map((s) => ({ ...s })))
      setBanner({ ok: true, text: '已保存' })
    } catch (e) {
      setBanner({ ok: false, text: `保存失败：${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-modal-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="p-modal" role="dialog" aria-label="管理提示词场景">
        <div className="p-modal-head">
          <h3 className="p-modal-title">管理提示词场景</h3>
          <button type="button" className="p-btn p-btn--sm" title="关闭" onClick={onClose}>
            <IconClose size={14} />
          </button>
        </div>

        {banner ? (
          <div className={banner.ok ? 'p-banner p-banner--ok' : 'p-banner p-banner--err'}>{banner.text}</div>
        ) : null}

        {editing ? (
          <SceneEditor
            scene={editing}
            existingIds={drafts.map((d) => d.id)}
            onCancel={() => setSel(null)}
            onSave={patch}
          />
        ) : (
          <>
            <div className="p-manage-list">
              {drafts.map((d) => {
                const vars = extractVariables(d.prompt)
                return (
                  <div key={d.id} className="p-manage-row">
                    <div className="p-manage-main">
                      <span className="p-manage-name">
                        {d.name || <em className="p-empty-inline">（未命名）</em>}
                        {d.builtin ? <span className="p-tag">内置</span> : null}
                      </span>
                      {d.description ? <span className="p-manage-desc">{d.description}</span> : null}
                      {vars.length > 0 ? (
                        <span className="p-vars">
                          {vars.map((v) => (
                            <code key={v} className="p-var">{`{${v}}`}</code>
                          ))}
                        </span>
                      ) : null}
                    </div>
                    <div className="p-manage-actions">
                      <button type="button" className="p-btn p-btn--sm" onClick={() => setSel(d.id)}>编辑</button>
                      {d.builtin ? null : (
                        <button
                          type="button"
                          className="p-btn p-btn--sm p-btn--danger"
                          title="删除场景"
                          onClick={() => remove(d.id)}
                        >
                          <IconTrash size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
              {drafts.length === 0 ? <div className="p-empty">还没有场景</div> : null}
            </div>
            <div className="p-row" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="p-btn p-btn--sm" onClick={() => setSel('new')}>
                <IconPlus size={12} />
                <span>新增场景</span>
              </button>
              <div className="p-row">
                <button type="button" className="p-btn p-btn--sm" onClick={onClose}>关闭</button>
                <button
                  type="button"
                  className="p-btn p-btn--sm p-btn--primary"
                  disabled={saving}
                  onClick={() => void saveAll()}
                >
                  {saving ? '保存中…' : '保存全部'}
                </button>
              </div>
            </div>
            <div className="p-hint">内置场景可编辑（以你的修改为准），不可删除；删除后重新载入插件会恢复 seed。</div>
          </>
        )}
      </div>
    </div>
  )
}

/** 单场景编辑表单（新增/编辑共用；保存写回列表草稿，未落盘直到「保存全部」）。 */
function SceneEditor({ scene, existingIds, onCancel, onSave }: {
  scene: Scene
  existingIds: string[]
  onCancel: () => void
  onSave: (next: Scene) => void
}) {
  const [name, setName] = useState(scene.name)
  const [description, setDescription] = useState(scene.description)
  const [prompt, setPrompt] = useState(scene.prompt)
  const vars = extractVariables(prompt)

  const submit = () => {
    const id = scene.id || uniqueId(name, existingIds)
    onSave({ ...scene, id, name, description, prompt })
  }

  return (
    <>
      <label className="p-form-row">
        <span className="p-form-label">名称 *</span>
        <input className="p-input" value={name} spellCheck={false} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="p-form-row">
        <span className="p-form-label">描述</span>
        <input
          className="p-input"
          value={description}
          spellCheck={false}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label className="p-form-row">
        <span className="p-form-label">提示词 *（用 {'{变量}'} 占位，发送前填充）</span>
        <textarea
          className="p-textarea"
          value={prompt}
          spellCheck={false}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </label>
      {vars.length > 0 ? (
        <span className="p-vars">
          变量：
          {vars.map((v) => (
            <code key={v} className="p-var">{`{${v}}`}</code>
          ))}
        </span>
      ) : (
        <div className="p-hint">无变量：选择后直接填充。</div>
      )}
      <div className="p-row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="p-btn p-btn--sm" onClick={onCancel}>取消</button>
        <button
          type="button"
          className="p-btn p-btn--sm p-btn--primary"
          disabled={!name.trim() || !prompt.trim()}
          onClick={submit}
        >
          写入列表
        </button>
      </div>
    </>
  )
}
