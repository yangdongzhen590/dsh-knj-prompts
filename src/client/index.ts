/**
 * dsh-knj-prompts client：注册输入框工具行右侧插槽（conversation.input.right），
 * 渲染 ScenePicker（Task 4：下拉选场景 → 变量填充 → 空白会话直接填草稿 /
 * 非空白自动开新会话再填，微调即可发送）。宿主 API 结论见 PROBE.md。
 */
import { createElement as h } from 'react'
import { injectPromptStyles, removePromptStyles } from './styles.ts'
import { ScenePicker, type ScenePickerProps } from './ScenePicker.tsx'
import { resolveSceneSessionStarter, type SceneSessionStarter } from './engine.ts'

export const name = 'dsh-knj-prompts'

/** ctx.slots 的最小结构面（宿主 dsh-client-runtime 提供 SlotRegistry）。 */
interface SlotsLike {
  register(opts: {
    name: string
    id: string
    order?: number
    priority?: number
  }, component: (props: unknown) => unknown): () => void
  /**
   * 0.1.2+ 宿主：等待插槽所属条目声明后再执行注册回调（conversation.* 槽随
   * 会话视图懒加载挂载，启动即 register 会被判「未声明」而拖垮插件装配）。
   * 新老宿主通用：老宿主无此方法时回退为直接 register。
   */
  inject?(name: string, callback: () => () => void): () => void
}

interface ClientContext {
  slots?: SlotsLike
  get?(name: string): unknown
  effect(callback: () => unknown, label?: string): void
}

/**
 * 客户端插件在 cordis 里等待的服务（真实服务名，见 PROBE.md）：
 * - slots —— 由 @deepseek-ai/dsh-client-runtime 提供（SlotRegistry）。
 * - sessions —— 仅用于兜底的「新建会话」原语（create/open）。**只作为软依赖**：
 *   用懒 getter 在交互时解析，宿主缺该服务也不会让 fiber 永久 pending 阻塞 boot。
 * 会话/输入能力（useSession / inputActions 等 session 作用域标准套件）经插槽注入
 * 组件本身，无需在此 inject。注意：**不要**依赖 InputZone owner share 的 `session`
 * ——`conversation.input.right` 的插槽声明无 owner，宿主以 renderSlot(name, {}) 渲染它，
 * owner share 只达 `conversation.input.dock`。
 * 注意：包名不是服务名——写包名（如 @deepseek-ai/dsh-client-ui-slots）会让 fiber
 * 永远 pending，web boot 直接失败。
 */
export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    injectPromptStyles()
    if (!ctx.slots) return
    const slots = ctx.slots
    /**
     * 懒解析「新建会话」能力：点击场景时再读（此时宿主已完整 boot）。
     * 解析与校验都在 engine.resolveSceneSessionStarter 内完成——服务名与形态随宿主
     * 版本而异（实测 `ctx.get('workspaces')` 是 Workspace 控制器、**没有** startSession），
     * 那里按可调用性逐级降级，绝不让调用点抛 TypeError。
     */
    const sessionStarterGet = (): SceneSessionStarter | undefined =>
      resolveSceneSessionStarter(ctx)
    const registerPicker = (): (() => void) => slots.register({
      name: 'conversation.input.right',
      id: 'knj-prompts',
      order: 100,
    }, (props) => {
      const p = props as ScenePickerProps
      return h(ScenePicker, {
        // owner share 在本宿主不达 input.right（插槽声明无 owner），保留为将来兼容；
        // 会话身份实际来自 session 作用域标准套件的 useSession。
        session: p.session,
        useSession: p.useSession,
        inputActions: p.inputActions,
        sessionStarter: sessionStarterGet,
      })
    })
    // 0.1.2+ 宿主：conversation.input.right 属 session 作用域懒加载槽，
    // 必须等宿主声明后再注册（slots.inject 模式，与 dsh-better-sidebar 等一致）；
    // 老宿主无 inject 时回退为直接 register，保持跨版本兼容。
    const dispose = typeof slots.inject === 'function'
      ? slots.inject('conversation.input.right', registerPicker)
      : registerPicker()
    return () => {
      dispose()
      // 卸载/HMR 时移除注入的 <style>，避免旧版本 CSS 常驻 DOM
      removePromptStyles()
    }
  }, 'dsh-knj-prompts: input.right slot')
}
