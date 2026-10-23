import CodeReviewerClient from "./CodeReviewerClient";

/**
 * Code Reviewer — thorough walk from the CLI / MCP or the GitHub bot.
 * Source is never stored. There is no paste-a-file checker.
 */
export default function CodeReviewerPage() {
  return <CodeReviewerClient />;
}
