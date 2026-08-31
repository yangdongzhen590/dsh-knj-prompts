/**
 * dsh-knj-prompts client：注册输入框工具行右侧插槽（conversation.input.right），
 * 渲染 ScenePicker（Task 4：下拉选场景 → 变量填充 → 空白会话直接填草稿 /
 * 非空白自动开新会话再填，微调即可发送）。宿主 API 结论见 PROBE.md。
 */
import { createElement as h } from 'react'
import { injectPromptStyles, removePromptStyles } from './styles.ts'
import { ScenePicker, type ScenePickerProps } from './ScenePicker.tsx'

export const name = 'dsh-knj-prompts'

/** ctx.slots 的最小结构面（宿主 dsh-client-runtime 提供 SlotRegistry）。 */
interface SlotsLike {
  register(opts: {
    name: string
    id: string
    order?: number
    priority?: number
  }, component: (props: unknown) => unknown): () => void
}

/** 宿主工作区服务最小面：startSession = 官方「新建会话」动作（连接当前工作区的空白会话并导航）。 */
interface WorkspacesLike {
  startSession(workspaceId?: string): void
}

interface ClientContext {
  slots?: SlotsLike
  workspaces?: WorkspacesLike
  effect(callback: () => unknown, label?: string): void
}

/**
 * 客户端插件在 cordis 里等待的服务（真实服务名，见 PROBE.md）：
 * - slots —— 由 @deepseek-ai/dsh-client-runtime 提供（SlotRegistry）。
 *   **只硬依赖 slots**：workspaces 用懒 getter 在交互时解析（与 dsh-knj-obsidian
 *   同款防御式读法）——宿主缺该服务时降级为「原地填充」而非 fiber 永久 pending
 *   阻塞 web boot；也避免 boot 早期（workspaces 尚未挂载）读到 undefined。
 * 会话/输入能力（sessionId / inputActions / InputZone owner share）经插槽标准套件
 * 注入组件本身，无需在此 inject。注意：包名不是服务名——写包名（如
 * @deepseek-ai/dsh-client-ui-slots）会让 fiber 永远 pending，web boot 直接失败。
 */
export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    injectPromptStyles()
    if (!ctx.slots) return
    /** 懒解析：点击场景时再读（此时宿主已完整 boot）。cordis 服务用 ctx.get(name)
     *  访问——ctx.workspaces 属性只在 fiber 声明了 inject 时才存在。 */
    const workspacesGet = (): WorkspacesLike | undefined => {
      try {
        const get = (ctx as unknown as { get?: (name: string) => unknown }).get
        return (typeof get === 'function' ? get('workspaces') : undefined) as WorkspacesLike | undefined
      } catch {
        return undefined
      }
    }
    const dispose = ctx.slots.register({
      name: 'conversation.input.right',
      id: 'knj-prompts',
      order: 100,
    }, (props) => {
      const p = props as ScenePickerProps
      return h(ScenePicker, {
        sessionId: p.sessionId,
        session: p.session,
        inputActions: p.inputActions,
        workspaces: workspacesGet,
      })
    })
    return () => {
      dispose()
      // 卸载/HMR 时移除注入的 <style>，避免旧版本 CSS 常驻 DOM
      removePromptStyles()
    }
  }, 'dsh-knj-prompts: input.right slot')
}
