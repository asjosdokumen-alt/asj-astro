/**
 * AiUnavailableBanner.tsx — "the AI is off right now" banner.
 *
 * WHY THIS EXISTS
 * ---------------
 * §6.5 row 3 of the degradation matrix promises "`ai_unavailable` returned; AI
 * tabs show a banner". The backend half is real: the provider layer raises
 * `AI_UNAVAILABLE` (503, retryable) when the key is missing, the breaker is
 * open, or every model and the Grok fallback failed. This is the banner half.
 *
 * It is deliberately NOT an error toast. "The AI is down" is not the user's
 * fault, their input is not wrong, and the rest of the app still works — the
 * banner says exactly that and points at the retry. The copy comes from the
 * server when it has specific user-safe text (see `Errors.aiUnavailable`).
 */
import { t } from "../../store/i18n";
import Icon from "./Icon";

interface Props {
  /** Server-supplied copy, when it had something specific and user-safe. */
  message?: string;
  class?: string;
}

export default function AiUnavailableBanner({ message, class: extraClass }: Props) {
  return (
    <div
      role="status"
      class={
        "flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-900/30 px-4 py-3 text-amber-200 " +
        (extraClass || "")
      }
    >
      <Icon name="exclamation-triangle" class="text-lg flex-shrink-0 mt-0.5" />
      <div class="text-xs leading-relaxed">
        <p class="font-bold">{t("ai.unavailable_title")}</p>
        <p class="text-amber-200/80">{message || t("ai.unavailable_body")}</p>
      </div>
    </div>
  );
}
