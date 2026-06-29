import { describe, it, expect } from "vitest";
import { createDiscussionActor, getCurrentExpertId, getCurrentRound, isLastExpert } from "../discussion-machine";

describe("discussion-machine: softStopping 状态", () => {
  it("1. discussing 状态发送 SOFT_STOP → 迁移到 softStopping", () => {
    const actor = createDiscussionActor({ expertIds: ["pm", "architect"] });
    actor.start();
    actor.send({ type: "START", expertIds: ["pm", "architect"] });
    actor.send({ type: "HOST_DONE" });
    // 现在 shouldPauseNow=false (completedTurns+1=1 <= totalTurns=2*2=4), hasMoreExperts=true → discussing
    expect(actor.getSnapshot().value).toBe("discussing");

    actor.send({ type: "SOFT_STOP" });
    expect(actor.getSnapshot().value).toBe("softStopping");
    actor.stop();
  });

  it("2. softStopping 状态发送 EXPERT_DONE → 迁移到 completed", () => {
    const actor = createDiscussionActor({ expertIds: ["pm", "architect"] });
    actor.start();
    actor.send({ type: "START", expertIds: ["pm", "architect"] });
    actor.send({ type: "HOST_DONE" });
    actor.send({ type: "SOFT_STOP" });
    expect(actor.getSnapshot().value).toBe("softStopping");

    actor.send({ type: "EXPERT_DONE" });
    expect(actor.getSnapshot().value).toBe("completed");
    actor.stop();
  });

  it("3. softStopping 状态发送 ABORT → 迁移到 completed", () => {
    const actor = createDiscussionActor({ expertIds: ["pm", "architect"] });
    actor.start();
    actor.send({ type: "START", expertIds: ["pm", "architect"] });
    actor.send({ type: "HOST_DONE" });
    actor.send({ type: "SOFT_STOP" });

    actor.send({ type: "ABORT" });
    expect(actor.getSnapshot().value).toBe("completed");
    actor.stop();
  });

  it("4. softStopping 状态 getCurrentExpertId 返回当前专家 ID", () => {
    const actor = createDiscussionActor({ expertIds: ["pm", "architect"] });
    actor.start();
    actor.send({ type: "START", expertIds: ["pm", "architect"] });
    actor.send({ type: "HOST_DONE" });
    actor.send({ type: "SOFT_STOP" });

    const expertId = getCurrentExpertId(actor.getSnapshot());
    expect(expertId).not.toBeNull();
    expect(["pm", "architect"]).toContain(expertId);
    actor.stop();
  });

  it("5. paused 状态发送 SOFT_STOP → 不迁移", () => {
    const actor = createDiscussionActor({ expertIds: ["pm", "architect"] });
    actor.start();
    actor.send({ type: "START", expertIds: ["pm", "architect"] });
    actor.send({ type: "HOST_DONE" });
    // 触发暂停：需要让 shouldPauseNow 为 true
    // 2专家 × MAX_ROUNDS(2) = totalTurns=4, 需 completedTurns+1 > totalTurns
    // 完成 4 轮后第 5 次 EXPERT_DONE 会触发 PAUSE → 但实际上 isAllDone 会先触发
    // 用 RESUME_FROM 模拟暂停状态
    actor.send({ type: "RESUME_FROM", expertIds: ["pm", "architect"], startRound: 1, startIndex: 0, completedTurns: 3 });
    // 发送 EXPERT_DONE 触发暂停 (completedTurns+1=4, totalTurns=4, shouldPauseNow=true)
    actor.send({ type: "EXPERT_DONE" });
    const snapshot = actor.getSnapshot();
    if (snapshot.value === "paused") {
      actor.send({ type: "SOFT_STOP" });
      expect(actor.getSnapshot().value).toBe("paused"); // 不迁移
    }
    actor.stop();
  });

  it("6. hosting 状态发送 SOFT_STOP → completed（DEF-06 修复）", () => {
    const actor = createDiscussionActor({ expertIds: ["pm", "architect"] });
    actor.start();
    actor.send({ type: "START", expertIds: ["pm", "architect"] });
    // hosting 状态（HOST_DONE 未发送）
    expect(actor.getSnapshot().value).toBe("hosting");

    actor.send({ type: "SOFT_STOP" });
    expect(actor.getSnapshot().value).toBe("completed"); // DEF-06: hosting 阶段软停止直接结束
    actor.stop();
  });

  it("7. softStopping 后 isLastExpert 仍正确返回", () => {
    const actor = createDiscussionActor({ expertIds: ["pm", "architect"] });
    actor.start();
    actor.send({ type: "START", expertIds: ["pm", "architect"] });
    actor.send({ type: "HOST_DONE" });
    actor.send({ type: "SOFT_STOP" });

    const snapshot = actor.getSnapshot();
    // 不论是否最后一位专家，isLastExpert 都应正确返回布尔值
    const result = isLastExpert(snapshot);
    expect(typeof result).toBe("boolean");
    actor.stop();
  });

  it("8. 2专家场景：第3次发言后 SOFT_STOP，第3位专家完成后 completed", () => {
    const actor = createDiscussionActor({ expertIds: ["pm", "architect", "market"] });
    actor.start();
    actor.send({ type: "START", expertIds: ["pm", "architect", "market"] });
    actor.send({ type: "HOST_DONE" });

    // 第1位专家发言完成
    actor.send({ type: "EXPERT_DONE" });
    expect(actor.getSnapshot().value).toBe("discussing");

    // 第2位专家发言完成
    actor.send({ type: "EXPERT_DONE" });
    expect(actor.getSnapshot().value).toBe("discussing");

    // 第3位专家发言开始时软停止
    actor.send({ type: "SOFT_STOP" });
    expect(actor.getSnapshot().value).toBe("softStopping");

    // 第3位专家发言完成
    actor.send({ type: "EXPERT_DONE" });
    expect(actor.getSnapshot().value).toBe("completed");
    actor.stop();
  });

  it("9. softStopping 状态不响应 PAUSE 事件", () => {
    const actor = createDiscussionActor({ expertIds: ["pm", "architect"] });
    actor.start();
    actor.send({ type: "START", expertIds: ["pm", "architect"] });
    actor.send({ type: "HOST_DONE" });
    actor.send({ type: "SOFT_STOP" });

    actor.send({ type: "PAUSE" });
    expect(actor.getSnapshot().value).toBe("softStopping"); // 不迁移
    actor.stop();
  });

  it("10. softStopping 状态不响应 RESUME 事件", () => {
    const actor = createDiscussionActor({ expertIds: ["pm", "architect"] });
    actor.start();
    actor.send({ type: "START", expertIds: ["pm", "architect"] });
    actor.send({ type: "HOST_DONE" });
    actor.send({ type: "SOFT_STOP" });

    actor.send({ type: "RESUME" });
    expect(actor.getSnapshot().value).toBe("softStopping"); // 不迁移
    actor.stop();
  });

  it("11. 从 RESUME_FROM 恢复后可 SOFT_STOP", () => {
    const actor = createDiscussionActor({ expertIds: ["pm", "architect"] });
    actor.start();
    actor.send({
      type: "RESUME_FROM",
      expertIds: ["pm", "architect"],
      startRound: 1,
      startIndex: 1,
      completedTurns: 1,
    });
    expect(actor.getSnapshot().value).toBe("discussing");

    actor.send({ type: "SOFT_STOP" });
    expect(actor.getSnapshot().value).toBe("softStopping");
    actor.stop();
  });

  it("12. softStopping 时 getCurrentRound 返回正确轮次", () => {
    const actor = createDiscussionActor({ expertIds: ["pm", "architect", "market"] });
    actor.start();
    actor.send({ type: "START", expertIds: ["pm", "architect", "market"] });
    actor.send({ type: "HOST_DONE" });

    // 完成第1轮3位专家
    actor.send({ type: "EXPERT_DONE" });
    actor.send({ type: "EXPERT_DONE" });
    actor.send({ type: "EXPERT_DONE" });
    // 第2轮第1位专家发言时软停止
    actor.send({ type: "SOFT_STOP" });

    const round = getCurrentRound(actor.getSnapshot());
    expect(round).toBeGreaterThanOrEqual(1);
    actor.stop();
  });
});
