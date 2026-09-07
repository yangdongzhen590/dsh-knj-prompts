/**
 * ScenePicker：输入框工具行右侧的「提示词」下拉（Task 4）。
 *
 * 流程：选场景 →（提示词含 {变量} 时先弹填充面板）→ 当前会话是空白会话
 * 则直接 setDraft 填充草稿；否则经 workspaces.startSession() 切到同工作区
 * 的空白会话，由新会话挂载的本组件消费 pendingFill 完成填充；微调即可发送。
 * 宿主 API 结论见 PROBE.md。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchScenes, fetchVars, saveScenes, saveVars, uploadScenePackage } from './api.ts'
import {
  buildScenePackageExportDraft,
  applyDraftEdit,
  applyDraftRemove,
  buildSceneEdit,
  buildVarEdit,
  extractVariables,
  fillPrompt,
  filterScenes,
  filterVars,
  hasDirtyScenes,
  hasDirtyVars,
  hasDuplicateVarNames,
  isPendingFillEligible,
  PENDING_TTL_MS,
  resolveSceneAction,
  validateScene,
  validateVar,
} from './engine.ts'
import type { SceneForm, VarForm } from './engine.ts'
import { IconChevronDown, IconClose, IconPlus, IconSparkles, IconTrash } from './icons.tsx'
import type { PromptVar, Scene } from '../types.ts'

/** 挂起填充：跨会话切换传递待填文本（模块级，生命周期 = 页面）。 */
interface PendingFill { text: string; at: number; fromSessionId?: string }
let pendingFill: PendingFill | undefined

type PickerMode = 'menu' | 'fill' | 'export-select'

/** 宿主注入本组件的最小结构面（标准套件 + InputZone owner share）。 */
export interface ScenePickerProps {
  /** InputZone owner share：会话快照（sessionId + blank=空日志）。 */
  session?: { sessionId?: string; blank?: boolean }
  /** 标准套件：inputActions.setDraft 是唯一公开草稿写通道。 */
  inputActions?: { setDraft(text: string): void }
  /**
   * 懒解析的 workspaces 服务（apply 传 getter，点击时再读——服务彼时必已挂载；
   * 缺服务时返回 undefined，降级为原地填充，绝不阻塞 boot）。
   */
  workspaces?: () => { startSession(workspaceId?: string): void } | undefined
}

/** 应用填充：决策见 engine.resolveSceneAction（空白→原地填；非空白→挂起并切新会话；无通道→兜底填当前）。 */
function applySceneText(props: ScenePickerProps, text: string): void {
  const sessionBlank = props.session?.blank
  // 当前 DSH 运行时的 input.right 只提供标准 inputActions，未注入 InputZone owner share。
  // 缺少会话身份/空白态时不能安全挂起跨会话填充，保守地直接写当前草稿。
  if (sessionBlank === undefined) {
    props.inputActions?.setDraft(text)
    return
  }
  const workspaces = props.workspaces?.()
  const action = resolveSceneAction(sessionBlank, workspaces !== undefined)
  if (action === 'fill-here') {
    props.inputActions?.setDraft(text)
    return
  }
  pendingFill = { text, at: Date.now(), fromSessionId: props.session?.sessionId }
  workspaces!.startSession()
}

export function ScenePicker(props: ScenePickerProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<PickerMode>('menu')
  const [manage, setManage] = useState(false)
  const [scenes, setScenes] = useState<Scene[] | null>(null) // null = 加载中
  const [vars, setVars] = useState<PromptVar[] | null>(null) // 变量库（填充面板下拉候选；null = 未加载/加载失败）
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [menuQuery, setMenuQuery] = useState('') // 下拉菜单场景搜索词（重开菜单时重置）
  const [fillScene, setFillScene] = useState<Scene | null>(null)
  const [fillValues, setFillValues] = useState<Record<string, string>>({})
  const [uploadingPackage, setUploadingPackage] = useState(false)
  const [packageError, setPackageError] = useState<string | null>(null)
  const [pos, setPos] = useState<{ right: number; bottom: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const packageInputRef = useRef<HTMLInputElement>(null)

  // 消费挂起填充：新空白会话挂载/重渲染时落地（TTL 内 + 会话差量守卫；幂等）
  useEffect(() => {
    if (!pendingFill) return
    if (
      isPendingFillEligible(
        props.session?.blank === true,
        Date.now() - pendingFill.at,
        pendingFill.fromSessionId,
        props.session?.sessionId,
      ) &&
      props.inputActions
    ) {
      const text = pendingFill.text
      pendingFill = undefined
      props.inputActions.setDraft(text)
    } else if (Date.now() - pendingFill.at > PENDING_TTL_MS) {
      // 过期清理：不让挂起填充无限滞留
      pendingFill = undefined
    }
  })

  const load = useCallback(async () => {
    setScenes(null)
    setLoadErr(null)
    try {
      // 变量库失败不阻断场景列表（填充面板降级为自由输入）
      const [scenes, vars] = await Promise.all([fetchScenes(), fetchVars().catch(() => null)])
      setScenes(scenes)
      setVars(vars)
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
    setMenuQuery('') // 重开菜单重置搜索词
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

  const installScenePackage = async (file: File) => {
    setPackageError(null)
    if (!/\.zip$/i.test(file.name)) {
      setPackageError('请选择 .zip 场景包')
      return
    }
    setUploadingPackage(true)
    try {
      const { path } = await uploadScenePackage(file)
      const installer = scenes?.find((scene) => scene.id === 'install-scene-package')
      if (!installer) throw new Error('未找到“安装场景包”内置场景')
      applySceneText(props, fillPrompt(installer.prompt, { 场景包ZIP路径: path }))
      setOpen(false)
    } catch (error) {
      setPackageError(error instanceof Error ? `上传失败：${error.message}` : '上传失败，请重试')
    } finally {
      setUploadingPackage(false)
    }
  }

  const pick = (s: Scene) => {
    if (s.id === 'export-scene-package') {
      setMenuQuery('')
      setMode('export-select')
      return
    }
    if (s.id === 'install-scene-package') {
      packageInputRef.current?.click()
      return
    }
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

  const exportScene = (scene: Scene) => {
    const exporter = scenes?.find((candidate) => candidate.id === 'export-scene-package')
    if (!exporter) return
    applySceneText(props, buildScenePackageExportDraft(exporter.prompt, scene))
    setOpen(false)
  }

  const inBlank = props.session?.blank === true

  return (
    <div className="knj-p p-anchor">
      <input
        ref={packageInputRef}
        className="p-file-input"
        type="file"
        accept=".zip,application/zip"
        aria-label="选择场景包 ZIP"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void installScenePackage(file)
        }}
      />
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
            ? <>{packageError ? <div className="p-banner p-banner--err">{packageError}</div> : null}{renderMenu(scenes, loadErr, menuQuery, setMenuQuery, () => void load(), pick, () => setManage(true), uploadingPackage)}</>
            : null}
          {mode === 'fill' && fillScene
            ? renderFill(fillScene, fillValues, setFillValues, inBlank, () => setMode('menu'), confirmFill, vars)
            : null}
          {mode === 'export-select'
            ? renderExportSelection(scenes, menuQuery, setMenuQuery, exportScene)
            : null}
        </div>
      )}

      {manage && (
        <ManageModal
          scenes={scenes ?? []}
          vars={vars ?? []}
          onClose={() => setManage(false)}
          onSaved={(next) => setScenes(next)}
          onVarsSaved={(next) => setVars(next)}
        />
      )}
    </div>
  )
}

/** 导出选择面板：只允许选用户创建的普通场景，单击即生成 exporter 草稿。 */
function renderExportSelection(
  scenes: Scene[] | null,
  query: string,
  setQuery: (q: string) => void,
  exportScene: (scene: Scene) => void,
) {
  if (!scenes) return <div className="p-empty">加载场景中…</div>
  const ordinary = scenes.filter((scene) => !scene.builtin)
  const filtered = filterScenes(ordinary, query)
  return (
    <>
      <div className="p-menu-title">选择要导出的场景</div>
      <div className="p-menu-hint">单击一个普通场景后，会将它的说明直接交给导出助手。</div>
      <input
        className="p-input p-search"
        value={query}
        placeholder="搜索普通场景"
        spellCheck={false}
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
      />
      {filtered.map((scene) => (
        <button key={scene.id} type="button" className="p-menu-item" onClick={() => exportScene(scene)}>
          <span className="p-menu-item__name">{scene.name}</span>
          {scene.description ? <span className="p-menu-item__desc">{scene.description}</span> : null}
        </button>
      ))}
      {filtered.length === 0 ? <div className="p-empty">没有可导出的普通场景</div> : null}
    </>
  )
}

/** 下拉主面板：场景搜索 + 列表 + 管理入口。 */
function renderMenu(
  scenes: Scene[] | null,
  loadErr: string | null,
  query: string,
  setQuery: (q: string) => void,
  retry: () => void,
  pick: (s: Scene) => void,
  openManage: () => void,
  uploadingPackage: boolean,
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
  const filtered = filterScenes(scenes, query)
  return (
    <>
      <input
        className="p-input p-search"
        value={query}
        placeholder="搜索场景（名称/描述/提示词）"
        spellCheck={false}
        onChange={(e) => setQuery(e.target.value)}
      />
      {filtered.map((s) => {
        const vars = extractVariables(s.prompt)
        return (
          <button key={s.id} type="button" className="p-menu-item" disabled={uploadingPackage} onClick={() => pick(s)}>
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
      {filtered.length === 0 ? <div className="p-empty">没有匹配的场景</div> : null}
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

/** 变量填充面板：逐变量输入（变量库非空时提供「选已配置变量取值」的可搜索下拉）+ 实时预览。 */
function renderFill(
  scene: Scene,
  values: Record<string, string>,
  setValues: (v: Record<string, string>) => void,
  inBlank: boolean,
  back: () => void,
  confirm: () => void,
  lib: PromptVar[] | null,
) {
  const vars = extractVariables(scene.prompt)
  const preview = fillPrompt(scene.prompt, values)
  const hasLib = !!lib && lib.length > 0
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
            {hasLib ? (
              <VarValueInput
                value={values[v] ?? ''}
                vars={lib}
                onChange={(val) => setValues({ ...values, [v]: val })}
              />
            ) : (
              <input
                className="p-input"
                value={values[v] ?? ''}
                placeholder={v}
                spellCheck={false}
                onChange={(e) => setValues({ ...values, [v]: e.target.value })}
              />
            )}
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

/** 可搜索变量下拉：聚焦列出全部已配置变量（「名称 = 值」），输入即子串过滤，选中取该变量的值填入；
 *  仍可自由输入任意值。下拉用 fixed 定位，避免被外层滚动容器（p-menu）裁剪。 */
function VarValueInput({ value, vars, onChange }: {
  value: string
  vars: PromptVar[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [popPos, setPopPos] = useState<{ left: number; top: number; width: number } | null>(null)

  const filtered = filterVars(vars, query)

  // 外点关闭
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const openPop = () => {
    const r = inputRef.current?.getBoundingClientRect()
    if (!r) return
    setPopPos({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 260) })
    setQuery('')
    setOpen(true)
  }

  return (
    <div ref={wrapRef} className="p-combo">
      <input
        ref={inputRef}
        className="p-input"
        value={value}
        placeholder="下拉选变量取其值，或直接输入"
        spellCheck={false}
        onFocus={openPop}
        onChange={(e) => { onChange(e.target.value); setQuery(e.target.value); setOpen(true) }}
      />
      {open && popPos && filtered.length > 0 && (
        <div className="p-combo-pop" style={{ position: 'fixed', left: popPos.left, top: popPos.top, width: popPos.width }}>
          {filtered.map((v) => (
            <button
              key={v.name}
              type="button"
              className="p-combo-item"
              title={`用「${v.name}」的值填充`}
              onClick={() => { onChange(v.value); setOpen(false) }}
            >
              <span className="p-combo-item__name">{v.name}</span>
              <span className="p-combo-item__val">= {v.value}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** 新场景草稿（id 由保存时 uniqueId 生成）。 */
function newDraft(): Scene {
  return { id: '', name: '', description: '', prompt: '', operationManual: '', builtin: false, updatedAt: '' }
}

/** 管理弹窗：场景 / 变量库 两个页签。两者均为单步保存（保存修改/删除 = 立即 PUT 落盘）。
 *  布局为三段式：固定头部（标题/关闭/Tab）+ 独立滚动内容区 + 固定底部操作栏；
 *  场景/变量很多或表单较长时，操作按钮不随内容滚走（「重试保存」始终可见）。
 *  保存失败时草稿保留 + 错误横幅 + 底部「重试保存」；关闭时若任一页有未落盘修改先确认。
 *  （导出仅为 .verify/ 组件级验证入口使用，非插件公开 API。） */
export function ManageModal({ scenes, vars, onClose, onSaved, onVarsSaved }: {
  scenes: Scene[]
  vars: PromptVar[]
  onClose: () => void
  onSaved: (next: Scene[]) => void
  onVarsSaved: (next: PromptVar[]) => void
}) {
  const [tab, setTab] = useState<'scenes' | 'vars'>('scenes')
  const [varDirty, setVarDirty] = useState(false)
  const [drafts, setDrafts] = useState<Scene[]>(() => scenes.map((s) => ({ ...s })))
  const [sel, setSel] = useState<string | 'new' | null>(null) // null=列表视图
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [sceneQuery, setSceneQuery] = useState('') // 场景列表搜索词
  // 编辑表单（受控；保存/取消入口在固定底部操作栏）。进入编辑器时由 sel 同步一次。
  const [editForm, setEditForm] = useState<SceneForm | null>(null)

  const dirty = hasDirtyScenes(scenes, drafts)

  const editing: Scene | null =
    sel === null ? null : sel === 'new' ? newDraft() : (drafts.find((d) => d.id === sel) ?? null)

  // 进入/切换编辑对象时同步表单（编辑器本身不持有本地状态）
  useEffect(() => {
    if (sel === null) {
      setEditForm(null)
      return
    }
    const base = sel === 'new' ? newDraft() : (drafts.find((d) => d.id === sel) ?? null)
    if (base) setEditForm({ name: base.name, description: base.description, prompt: base.prompt, operationManual: base.operationManual })
  }, [sel])

  /** 单步落盘：校验 → PUT → 反馈。target 由调用方显式传入（setDrafts 异步，闭包里的 drafts 可能陈旧）。 */
  const persist = async (target: Scene[], okText = '已保存') => {
    if (saving) return
    const invalid = target.filter((d) => !validateScene(d))
    if (invalid.length > 0) {
      setBanner({ ok: false, text: `有 ${invalid.length} 个场景未填名称/提示词或 id 非法，请先修正` })
      return
    }
    setSaving(true)
    setBanner(null)
    try {
      const saved = await saveScenes(target)
      onSaved(saved)
      setDrafts(saved.map((s) => ({ ...s })))
      setBanner({ ok: true, text: okText })
    } catch (e) {
      setBanner({ ok: false, text: `保存失败：${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setSaving(false)
    }
  }

  /** 编辑器保存：写回草稿 → 回列表 → 立即落盘（单步，无需再点任何按钮）。 */
  const saveEdit = (next: Scene) => {
    if (sel === null || saving) return
    const nextDrafts = applyDraftEdit(drafts, sel, next)
    setDrafts(nextDrafts)
    setSel(null)
    void persist(nextDrafts)
  }

  /** 固定底部操作栏的「保存修改」：用受控表单构建场景（新增时由名称生成不冲突 id）。 */
  const submitEdit = () => {
    if (sel === null || saving || !editForm) return
    const base = sel === 'new' ? newDraft() : (drafts.find((d) => d.id === sel) ?? null)
    if (!base) return
    saveEdit(buildSceneEdit(base, editForm, drafts.map((d) => d.id)))
  }

  /** 删除：确认后移除并立即落盘（单步）。 */
  const remove = (id: string) => {
    if (!window.confirm('确定删除这个场景吗？删除后立即生效，不可撤销。')) return
    const nextDrafts = applyDraftRemove(drafts, id)
    setDrafts(nextDrafts)
    if (sel === id) setSel(null)
    void persist(nextDrafts, '已删除并保存')
  }

  /** 关闭守卫：场景或变量草稿与磁盘不一致（上次保存失败）时确认，防静默丢改动。 */
  const handleClose = () => {
    if (
      (dirty || varDirty)
      && !window.confirm('有未保存的修改（可能是上次保存失败），关闭将丢弃这些修改。确定关闭吗？')
    ) return
    onClose()
  }

  return (
    <div className="p-modal-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose() }}>
      <div className="p-modal" role="dialog" aria-label="管理提示词场景与变量">
        <div className="p-modal-head">
          <h3 className="p-modal-title">{tab === 'scenes' ? '管理提示词场景' : '管理变量库'}</h3>
          <button type="button" className="p-btn p-btn--sm" title="关闭" onClick={handleClose}>
            <IconClose size={14} />
          </button>
        </div>

        <div className="p-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'scenes'}
            className={tab === 'scenes' ? 'p-tab p-tab--on' : 'p-tab'}
            onClick={() => setTab('scenes')}
          >
            场景
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'vars'}
            className={tab === 'vars' ? 'p-tab p-tab--on' : 'p-tab'}
            onClick={() => setTab('vars')}
          >
            变量库
          </button>
        </div>

        {tab === 'scenes' ? (
          <>
            <div className="p-modal-body">
              {banner ? (
                <div className={banner.ok ? 'p-banner p-banner--ok' : 'p-banner p-banner--err'}>{banner.text}</div>
              ) : null}

              {editing ? (
                <SceneEditor form={editForm} onChange={setEditForm} />
              ) : (
                <>
                  {drafts.length > 0 ? (
                    <input
                      className="p-input p-search"
                      value={sceneQuery}
                      placeholder="搜索场景（名称/描述/提示词）"
                      spellCheck={false}
                      onChange={(e) => setSceneQuery(e.target.value)}
                    />
                  ) : null}
                  <div className="p-manage-list">
                    {filterScenes(drafts, sceneQuery).map((d) => {
                      const varsInPrompt = extractVariables(d.prompt)
                      return (
                        <div key={d.id} className="p-manage-row">
                          <div className="p-manage-main">
                            <span className="p-manage-name">
                              {d.name || <em className="p-empty-inline">（未命名）</em>}
                              {d.builtin ? <span className="p-tag">内置</span> : null}
                            </span>
                            {d.description ? <span className="p-manage-desc">{d.description}</span> : null}
                            {varsInPrompt.length > 0 ? (
                              <span className="p-vars">
                                {varsInPrompt.map((v) => (
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
                    {drafts.length > 0 && filterScenes(drafts, sceneQuery).length === 0 ? (
                      <div className="p-empty">没有匹配的场景</div>
                    ) : null}
                  </div>
                  <div className="p-hint">
                    保存修改 / 删除会立即写入磁盘；删除前需确认。保存失败时草稿保留，可点「重试保存」。
                    内置场景可编辑（以你的修改为准），不可删除；删除后重新载入插件会恢复 seed。
                    在「变量库」页签可配置可复用的 {'{变量}'} 候选值。
                  </div>
                </>
              )}
            </div>
            <div className="p-modal-foot">
              {editing ? (
                <>
                  <span />
                  <div className="p-row">
                    <button type="button" className="p-btn p-btn--sm" onClick={() => setSel(null)}>取消</button>
                    <button
                      type="button"
                      className="p-btn p-btn--sm p-btn--primary"
                      disabled={saving || !editForm?.name.trim() || !editForm?.prompt.trim()}
                      onClick={submitEdit}
                    >
                      保存修改
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button type="button" className="p-btn p-btn--sm" onClick={() => setSel('new')}>
                    <IconPlus size={12} />
                    <span>新增场景</span>
                  </button>
                  <div className="p-row">
                    <button type="button" className="p-btn p-btn--sm" onClick={handleClose}>关闭</button>
                    {banner && !banner.ok && dirty ? (
                      <button
                        type="button"
                        className="p-btn p-btn--sm p-btn--primary"
                        disabled={saving}
                        onClick={() => void persist(drafts)}
                      >
                        {saving ? '保存中…' : '重试保存'}
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <VarManager
            vars={vars}
            onSaved={onVarsSaved}
            onClose={handleClose}
            onDirtyChange={setVarDirty}
          />
        )}
      </div>
    </div>
  )
}

/** 变量库管理：新增 / 编辑 / 删除，单步保存（与场景页同模式）。全局共享、名称大小写不敏感唯一。
 *  三段式布局：内容区（p-modal-body）独立滚动，操作栏（p-modal-foot）固定。 */
function VarManager({ vars, onSaved, onClose, onDirtyChange }: {
  vars: PromptVar[]
  onSaved: (next: PromptVar[]) => void
  onClose: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const [drafts, setDrafts] = useState<PromptVar[]>(() => (vars ?? []).map((v) => ({ ...v })))
  const [sel, setSel] = useState<string | 'new' | null>(null) // null=列表视图
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [varQuery, setVarQuery] = useState('') // 变量列表搜索词
  // 编辑表单（受控；保存/取消入口在固定底部操作栏）。进入编辑器时由 sel 同步一次。
  const [editForm, setEditForm] = useState<VarForm | null>(null)

  const dirty = hasDirtyVars(vars, drafts)
  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])

  const editing: PromptVar | null =
    sel === null
      ? null
      : sel === 'new'
        ? { name: '', value: '', updatedAt: '' }
        : (drafts.find((d) => d.name.toLowerCase() === sel.toLowerCase()) ?? null)

  // 进入/切换编辑对象时同步表单（编辑器本身不持有本地状态）
  useEffect(() => {
    if (sel === null) {
      setEditForm(null)
      return
    }
    const base = sel === 'new'
      ? { name: '', value: '', updatedAt: '' }
      : (drafts.find((d) => d.name.toLowerCase() === sel.toLowerCase()) ?? null)
    if (base) setEditForm({ name: base.name, value: base.value })
  }, [sel])

  /** 单步落盘：校验 → PUT → 反馈（与场景页同款）。 */
  const persist = async (target: PromptVar[], okText = '已保存') => {
    if (saving) return
    const invalid = target.filter((d) => !validateVar(d))
    if (invalid.length > 0) {
      setBanner({ ok: false, text: '有变量未填名称或没有候选值，请先修正' })
      return
    }
    setSaving(true)
    setBanner(null)
    try {
      const saved = await saveVars(target)
      onSaved(saved)
      setDrafts(saved.map((v) => ({ ...v })))
      setBanner({ ok: true, text: okText })
    } catch (e) {
      setBanner({ ok: false, text: `保存失败：${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setSaving(false)
    }
  }

  const saveEdit = (next: PromptVar) => {
    if (sel === null || saving) return
    const nextDrafts = sel === 'new'
      ? [...drafts, next]
      : drafts.map((d) => (d.name.toLowerCase() === sel.toLowerCase() ? next : d))
    if (hasDuplicateVarNames(nextDrafts)) {
      setBanner({ ok: false, text: '变量名重复（不区分大小写），请修改后重试' })
      return // 不写草稿，编辑器保持打开让用户改名
    }
    setDrafts(nextDrafts)
    setSel(null)
    void persist(nextDrafts)
  }

  /** 固定底部操作栏的「保存修改」：用受控表单构建变量条目（去空白）。 */
  const submitEdit = () => {
    if (sel === null || saving || !editForm) return
    const base = sel === 'new'
      ? { name: '', value: '', updatedAt: '' }
      : (drafts.find((d) => d.name.toLowerCase() === sel.toLowerCase()) ?? null)
    if (!base) return
    saveEdit(buildVarEdit(base, editForm))
  }

  const remove = (name: string) => {
    if (!window.confirm(`确定删除变量「${name}」吗？删除后立即生效，不可撤销。`)) return
    const nextDrafts = drafts.filter((d) => d.name.toLowerCase() !== name.toLowerCase())
    setDrafts(nextDrafts)
    if (sel !== null && sel !== 'new' && sel.toLowerCase() === name.toLowerCase()) setSel(null)
    void persist(nextDrafts, '已删除并保存')
  }

  return (
    <>
      <div className="p-modal-body">
        {banner ? (
          <div className={banner.ok ? 'p-banner p-banner--ok' : 'p-banner p-banner--err'}>{banner.text}</div>
        ) : null}

        {editing ? (
          <VarEditor form={editForm} onChange={setEditForm} />
        ) : (
          <>
            {drafts.length > 0 ? (
              <input
                className="p-input p-search"
                value={varQuery}
                placeholder="搜索变量（名称/值）"
                spellCheck={false}
                onChange={(e) => setVarQuery(e.target.value)}
              />
            ) : null}
            <div className="p-manage-list">
              {filterVars(drafts, varQuery).map((v) => (
                <div key={v.name} className="p-manage-row">
                  <div className="p-manage-main">
                    <span className="p-manage-name">{v.name}</span>
                    {v.value ? (
                      <span className="p-manage-desc">= {v.value}</span>
                    ) : null}
                  </div>
                  <div className="p-manage-actions">
                    <button type="button" className="p-btn p-btn--sm" onClick={() => setSel(v.name)}>编辑</button>
                    <button
                      type="button"
                      className="p-btn p-btn--sm p-btn--danger"
                      title="删除变量"
                      onClick={() => remove(v.name)}
                    >
                      <IconTrash size={13} />
                    </button>
                  </div>
                </div>
              ))}
              {drafts.length === 0 ? <div className="p-empty">还没有变量，先添加一个</div> : null}
              {drafts.length > 0 && filterVars(drafts, varQuery).length === 0 ? (
                <div className="p-empty">没有匹配的变量</div>
              ) : null}
            </div>
            <div className="p-hint">
              变量全局共享：任意场景的填充面板里，每个 {'{变量}'} 下拉列出全部已配置变量（名称 = 值），选中即用该变量的值填入；也可手动输入。变量名不区分大小写且不可重复；删除前会确认。
            </div>
          </>
        )}
      </div>
      <div className="p-modal-foot">
        {editing ? (
          <>
            <span />
            <div className="p-row">
              <button type="button" className="p-btn p-btn--sm" onClick={() => setSel(null)}>取消</button>
              <button
                type="button"
                className="p-btn p-btn--sm p-btn--primary"
                disabled={saving || !editForm?.name.trim() || !editForm?.value.trim()}
                onClick={submitEdit}
              >
                保存修改
              </button>
            </div>
          </>
        ) : (
          <>
            <button type="button" className="p-btn p-btn--sm" onClick={() => setSel('new')}>
              <IconPlus size={12} />
              <span>新增变量</span>
            </button>
            <div className="p-row">
              <button type="button" className="p-btn p-btn--sm" onClick={onClose}>关闭</button>
              {banner && !banner.ok && dirty ? (
                <button
                  type="button"
                  className="p-btn p-btn--sm p-btn--primary"
                  disabled={saving}
                  onClick={() => void persist(drafts)}
                >
                  {saving ? '保存中…' : '重试保存'}
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </>
  )
}

/** 单变量编辑表单（受控；「保存修改/取消」在管理弹窗固定底部操作栏）。 */
function VarEditor({ form, onChange }: {
  form: VarForm | null
  onChange: (next: VarForm) => void
}) {
  if (!form) return null
  return (
    <>
      <label className="p-form-row">
        <span className="p-form-label">变量名 *（如 项目 / 范围，不区分大小写）</span>
        <input className="p-input" value={form.name} spellCheck={false} onChange={(e) => onChange({ ...form, name: e.target.value })} />
      </label>
      <label className="p-form-row">
        <span className="p-form-label">值 *（填充时点选此变量即插入该值）</span>
        <input
          className="p-input"
          value={form.value}
          placeholder="如 iobs_pro / 多租户缓存服务"
          spellCheck={false}
          onChange={(e) => onChange({ ...form, value: e.target.value })}
        />
      </label>
      <div className="p-hint">改一处全局生效：所有场景填充时都能选到这个变量。</div>
    </>
  )
}

/** 单场景编辑表单（受控；「保存修改/取消」在管理弹窗固定底部操作栏）。 */
function SceneEditor({ form, onChange }: {
  form: SceneForm | null
  onChange: (next: SceneForm) => void
}) {
  if (!form) return null
  const vars = extractVariables(form.prompt)
  return (
    <>
      <label className="p-form-row">
        <span className="p-form-label">名称 *</span>
        <input className="p-input" value={form.name} spellCheck={false} onChange={(e) => onChange({ ...form, name: e.target.value })} />
      </label>
      <label className="p-form-row">
        <span className="p-form-label">描述</span>
        <input
          className="p-input"
          value={form.description}
          spellCheck={false}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
        />
      </label>
      <label className="p-form-row">
        <span className="p-form-label">提示词 *（用 {'{变量}'} 占位，发送前填充）</span>
        <textarea
          className="p-textarea"
          value={form.prompt}
          spellCheck={false}
          onChange={(e) => onChange({ ...form, prompt: e.target.value })}
        />
      </label>
      <details className="p-operation-manual">
        <summary>场景包操作说明（Markdown，可选）</summary>
        <p className="p-hint">导出场景包时，这里是依赖、素材与配置迁移说明的唯一来源。</p>
        <textarea
          className="p-textarea p-operation-manual__input"
          value={form.operationManual}
          placeholder="例如：需要嵌入的 skills、材料目录、目标环境配置步骤与验证方式。"
          spellCheck={false}
          onChange={(e) => onChange({ ...form, operationManual: e.target.value })}
        />
      </details>
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
    </>
  )
}
