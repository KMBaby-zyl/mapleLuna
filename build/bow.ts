import { calculateAdaptiveStrategy, calculateStrategies } from "./base";

declare const require: (name: string) => {
  mkdirSync?: (path: string, options?: { recursive?: boolean }) => void;
  writeFileSync?: (path: string, data: string, encoding: string) => void;
  join?: (...parts: string[]) => string;
};

declare const process:
  | {
    argv: string[];
    cwd: () => string;
  }
  | undefined;

const weaponType = "bow";
const weaponName = "弓";

const config = {
  // 目标：卷轴最终加成攻击力必须大于等于这些值
  targetTotalAttack: {
    10: true,
    11: true,
    12: true,
    13: true,
    14: true,
    15: true,
  },

  // 弓默认可上 7 次卷轴
  slots: 7,

  // ===== 在这里输入不同基础攻击力弓的价格 =====
  weaponCostByBaseAttack: {
    96: 3_000_000,
    97: 5_000_000,
    98: 10_000_000,
    99: 15_000_000,
  },

  // ===== 在这里输入卷轴成本 =====
  tenPercentScrollCost: 2_000_000,
  sixtyPercentScrollCost: 6_000_000,
};

type LogFn = (message?: string) => void;

function writeLogFile(
  baseAttack: number,
  targetTotalAttack: number,
  logLines: string[],
): string {
  const { mkdirSync, writeFileSync } = require("fs");
  const { join } = require("path");

  if (!mkdirSync || !writeFileSync || !join) {
    throw new Error("Cannot write log file in this runtime.");
  }

  const logDir = join(
    process?.cwd?.() ?? ".",
    "build",
    `${weaponType}-target-${targetTotalAttack}`,
  );
  mkdirSync(logDir, { recursive: true });

  const logPath = join(logDir, `attack-${baseAttack}.log`);
  writeFileSync(logPath, `${logLines.join("\n")}\n`, "utf8");
  return logPath;
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "N/A";

  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(4)}%`;
}

function printStrategy(
  strategy: ReturnType<typeof calculateStrategies>[number],
  log: LogFn,
): void {
  log(
    [
      `${strategy.tenPercentScrolls}x 10%`,
      `${strategy.sixtyPercentScrolls}x 60%`,
      `单次成本=${formatMoney(strategy.attemptCost)}`,
      `达标概率=${formatPercent(strategy.successProbability)}`,
      `期望成本=${formatMoney(strategy.expectedCostPerSuccess)}`,
    ].join(" | "),
  );
}

function printAdaptiveDecision(
  decision: NonNullable<ReturnType<typeof calculateAdaptiveStrategy>>["decisions"][number],
  log: LogFn,
): void {
  const actionText =
    decision.action === "abandon" ? "放弃重来" : `继续砸 ${decision.action}`;

  log(
    [
      `已用=${decision.slotsUsed}`,
      `剩余=${decision.slotsRemaining}`,
      `当前攻=${decision.attackGain}`,
      `到达概率=${formatPercent(decision.stateProbability)}`,
      `决策=${actionText}`,
      `后续成功率=${formatPercent(decision.successProbability)}`,
      `后续期望成本=${formatMoney(decision.expectedRemainingCost)}`,
    ].join(" | "),
  );
}

function runOne(baseAttack: number, weaponCost: number, targetAttackGain: number): string {
  const logLines: string[] = [];
  const log: LogFn = (message = "") => {
    logLines.push(message);
    console.log(message);
  };
  const calculatorConfig = {
    slots: config.slots,
    targetAttackGain,
    weaponCost,
    tenPercentScrollCost: config.tenPercentScrollCost,
    sixtyPercentScrollCost: config.sixtyPercentScrollCost,
  };
  const strategies = calculateStrategies(calculatorConfig);
  const bestStrategy = strategies.find(({ successProbability }) => successProbability > 0);
  const adaptiveStrategy = calculateAdaptiveStrategy(calculatorConfig);

  log(`${weaponName}卷轴成本计算`);
  log(`基础攻击力：${baseAttack}`);
  log(`目标：卷轴攻击加成 >= ${targetAttackGain}`);
  log(`达标后武器总攻击力 >= ${baseAttack + targetAttackGain}`);
  log(
    `成本：${weaponName}=${formatMoney(weaponCost)}，10%卷轴=${formatMoney(
      config.tenPercentScrollCost,
    )}，60%卷轴=${formatMoney(config.sixtyPercentScrollCost)}`,
  );
  log("");

  if (!bestStrategy) {
    log("没有任何策略可以达到目标。");
    return writeLogFile(baseAttack, targetAttackGain, logLines);
  }

  if (adaptiveStrategy) {
    const firstDecision = adaptiveStrategy.decisions[0];

    log("最优策略（允许失败后放弃重来）：");
    log(
      [
        `首张=${firstDecision?.action ?? "N/A"}`,
        `单轮成本=${formatMoney(adaptiveStrategy.attemptCost)}`,
        `单轮达标概率=${formatPercent(adaptiveStrategy.successProbability)}`,
        `长期期望成本=${formatMoney(adaptiveStrategy.expectedCostPerSuccess)}`,
      ].join(" | "),
    );
    log("");

    if (adaptiveStrategy.abandonStates.length > 0) {
      log("应该放弃重来的状态：");
      adaptiveStrategy.abandonStates.forEach((decision) =>
        printAdaptiveDecision(decision, log),
      );
      log("");
    } else {
      log("该配置下没有中途放弃点。");
      log("");
    }

    log("可到达状态的最优决策：");
    adaptiveStrategy.decisions.forEach((decision) => printAdaptiveDecision(decision, log));
    log("");
  }

  log("固定砸满 7 张的最优对照：");
  printStrategy(bestStrategy, log);
  log("");

  log("固定砸满 7 张的全部策略：");
  strategies.forEach((strategy) => printStrategy(strategy, log));

  return writeLogFile(baseAttack, targetAttackGain, logLines);
}

function run(): void {
  const targetEntries = Object.keys(config.targetTotalAttack)
    .map(Number)
    .sort((a, b) => a - b);
  const weaponEntries = Object.entries(config.weaponCostByBaseAttack)
    .map(([baseAttack, weaponCost]) => [Number(baseAttack), weaponCost] as const)
    .sort(([a], [b]) => a - b);
  let generatedCount = 0;

  if (targetEntries.length === 0) {
    console.log("请先在 targetTotalAttack 里输入至少一个目标卷轴攻击加成。");
    return;
  }

  if (weaponEntries.length === 0) {
    console.log("请先在 weaponCostByBaseAttack 里输入至少一个基础攻击力和价格。");
    return;
  }

  for (const [targetIndex, targetAttackGain] of targetEntries.entries()) {
    for (const [weaponIndex, [baseAttack, weaponCost]] of weaponEntries.entries()) {
      if (targetIndex > 0 || weaponIndex > 0) {
        console.log("");
        console.log("=".repeat(80));
        console.log("");
      }

      const logPath = runOne(baseAttack, weaponCost, targetAttackGain);
      generatedCount += 1;
      console.log("");
      console.log(`日志已写入：${logPath}`);
    }
  }

  console.log("");
  console.log(`共生成 ${generatedCount} 个日志文件。`);
}

if (typeof process !== "undefined" && /bow\.(ts|js)$/.test(process.argv[1] ?? "")) {
  run();
}
