import { describe, it } from "node:test";
import { RuleTester } from "oxlint/plugins-dev";
import { handlerPrefix } from "./rule.ts";

RuleTester.describe = describe;
RuleTester.it = it;
new RuleTester().run("handler-prefix", handlerPrefix, {
  valid: [
    {
      code: "function handleClose() {} const view = <Panel onClose={handleClose} />;",
      filename: "sample.tsx",
    },
    {
      code: "function Panel({ onClose }) { return <Button onClick={onClose} />; }",
      filename: "sample.tsx",
    },
    {
      code: "import { close } from 'sdk'; const view = <Button onClick={close} />;",
      filename: "sample.tsx",
    },
    {
      code: "function close() {} function Panel(close) { return <Button onClick={close} />; }",
      filename: "sample.tsx",
    },
  ],
  invalid: [
    {
      code: "function close() {} const view = <Button onClick={close} />;",
      filename: "sample.tsx",
      errors: [{ messageId: "handleName" }],
    },
    {
      code: "const close = () => {}; const view = <Dialog onOpenChange={close} />;",
      filename: "sample.tsx",
      errors: [{ messageId: "handleName" }],
    },
    {
      code: "function abort() {} signal.addEventListener('abort', abort);",
      errors: [{ messageId: "handleName" }],
    },
    {
      code: "function abort() {} signal['addEventListener']('abort', abort);",
      errors: [{ messageId: "handleName" }],
    },
  ],
});
