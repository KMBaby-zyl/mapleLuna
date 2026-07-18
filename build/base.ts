type ScrollKind = "10%" | "60%";
type DecisionAction = ScrollKind | "abandon" | "success" | "fail";

type Scroll = {
  kind: ScrollKind;
  successRate: number;
  attackGain: number;
  cost: number;
};

export type CalculatorConfig = {
  slots: number;
  targetAttackGain: number;
  weaponCost: number;
  tenPercentScrollCost: number;
  sixtyPercentScrollCost: number;
};

export type StrategyResult = {
  tenPercentScrolls: number;
  sixtyPercentScrolls: number;
  attemptCost: number;
  successProbability: number;
  expectedCostPerSuccess: number;
  attackDistribution: Array<{ attackGain: number; probability: number }>;
};

export type AdaptiveDecision = {
  slotsUsed: number;
  slotsRemaining: number;
  attackGain: number;
  stateProbability: number;
  action: DecisionAction;
  expectedRemainingCost: number;
  successProbability: number;
};

export type AdaptiveStrategyResult = {
  attemptCost: number;
  successProbability: number;
  expectedCostPerSuccess: number;
  decisions: AdaptiveDecision[];
  abandonStates: AdaptiveDecision[];
  iterations: number;
};

declare const process:
  | {
      argv: string[];
      exitCode?: number;
    }
  | undefined;

const DEFAULT_CONFIG: CalculatorConfig = {
  slots: 7,
  targetAttackGain: 8,
  weaponCost: 1_000_000,
  tenPercentScrollCost: 500_000,
  sixtyPercentScrollCost: 100_000,
};

function combination(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;

  const smallerK = Math.min(k, n - k);
  let result = 1;

  for (let i = 1; i <= smallerK; i += 1) {
    result = (result * (n - smallerK + i)) / i;
  }

  return result;
}

function binomialProbability(
  trials: number,
  successes: number,
  successRate: number,
): number {
  return (
    combination(trials, successes) *
    successRate ** successes *
    (1 - successRate) ** (trials - successes)
  );
}

function buildAttackDistribution(
  tenPercentScrolls: number,
  sixtyPercentScrolls: number,
  tenPercentScroll: Scroll,
  sixtyPercentScroll: Scroll,
): Array<{ attackGain: number; probability: number }> {
  const distribution = new Map<number, number>();

  for (let tenSuccesses = 0; tenSuccesses <= tenPercentScrolls; tenSuccesses += 1) {
    const tenProbability = binomialProbability(
      tenPercentScrolls,
      tenSuccesses,
      tenPercentScroll.successRate,
    );

    for (
      let sixtySuccesses = 0;
      sixtySuccesses <= sixtyPercentScrolls;
      sixtySuccesses += 1
    ) {
      const sixtyProbability = binomialProbability(
        sixtyPercentScrolls,
        sixtySuccesses,
        sixtyPercentScroll.successRate,
      );
      const attackGain =
        tenSuccesses * tenPercentScroll.attackGain +
        sixtySuccesses * sixtyPercentScroll.attackGain;
      const probability = tenProbability * sixtyProbability;

      distribution.set(
        attackGain,
        (distribution.get(attackGain) ?? 0) + probability,
      );
    }
  }

  return [...distribution.entries()]
    .map(([attackGain, probability]) => ({ attackGain, probability }))
    .sort((a, b) => a.attackGain - b.attackGain);
}

export function calculateStrategies(config: CalculatorConfig): StrategyResult[] {
  const tenPercentScroll: Scroll = {
    kind: "10%",
    successRate: 0.1,
    attackGain: 5,
    cost: config.tenPercentScrollCost,
  };
  const sixtyPercentScroll: Scroll = {
    kind: "60%",
    successRate: 0.6,
    attackGain: 2,
    cost: config.sixtyPercentScrollCost,
  };

  const strategies: StrategyResult[] = [];

  for (let tenPercentScrolls = 0; tenPercentScrolls <= config.slots; tenPercentScrolls += 1) {
    const sixtyPercentScrolls = config.slots - tenPercentScrolls;
    const attackDistribution = buildAttackDistribution(
      tenPercentScrolls,
      sixtyPercentScrolls,
      tenPercentScroll,
      sixtyPercentScroll,
    );
    const successProbability = attackDistribution
      .filter(({ attackGain }) => attackGain >= config.targetAttackGain)
      .reduce((sum, { probability }) => sum + probability, 0);
    const attemptCost =
      config.weaponCost +
      tenPercentScrolls * tenPercentScroll.cost +
      sixtyPercentScrolls * sixtyPercentScroll.cost;

    strategies.push({
      tenPercentScrolls,
      sixtyPercentScrolls,
      attemptCost,
      successProbability,
      expectedCostPerSuccess:
        successProbability > 0 ? attemptCost / successProbability : Number.POSITIVE_INFINITY,
      attackDistribution,
    });
  }

  return strategies.sort((a, b) => {
    if (a.expectedCostPerSuccess !== b.expectedCostPerSuccess) {
      return a.expectedCostPerSuccess - b.expectedCostPerSuccess;
    }
    if (a.attemptCost !== b.attemptCost) {
      return a.attemptCost - b.attemptCost;
    }
    return b.successProbability - a.successProbability;
  });
}

export function findBestStrategy(config: CalculatorConfig): StrategyResult | null {
  return calculateStrategies(config).find(
    ({ successProbability }) => successProbability > 0,
  ) ?? null;
}

type StateEvaluation = {
  objectiveValue: number;
  expectedCost: number;
  successProbability: number;
  action: DecisionAction;
};

type LambdaSolveResult = {
  attemptCost: number;
  successProbability: number;
  objectiveValue: number;
  evaluations: Map<string, StateEvaluation>;
};

function getScrolls(config: CalculatorConfig): Scroll[] {
  return [
    {
      kind: "10%",
      successRate: 0.1,
      attackGain: 5,
      cost: config.tenPercentScrollCost,
    },
    {
      kind: "60%",
      successRate: 0.6,
      attackGain: 2,
      cost: config.sixtyPercentScrollCost,
    },
  ];
}

function stateKey(slotsRemaining: number, attackGain: number): string {
  return `${slotsRemaining}:${attackGain}`;
}

function compareEvaluations(a: StateEvaluation, b: StateEvaluation): number {
  const objectiveDiff = a.objectiveValue - b.objectiveValue;
  if (Math.abs(objectiveDiff) > 1e-10) return objectiveDiff;

  const costDiff = a.expectedCost - b.expectedCost;
  if (Math.abs(costDiff) > 1e-10) return costDiff;

  return b.successProbability - a.successProbability;
}

function solveForLambda(config: CalculatorConfig, lambda: number): LambdaSolveResult {
  const scrolls = getScrolls(config);
  const evaluations = new Map<string, StateEvaluation>();

  function evaluate(slotsRemaining: number, attackGain: number): StateEvaluation {
    if (attackGain >= config.targetAttackGain) {
      return {
        objectiveValue: -lambda,
        expectedCost: 0,
        successProbability: 1,
        action: "success",
      };
    }

    if (slotsRemaining === 0) {
      return {
        objectiveValue: 0,
        expectedCost: 0,
        successProbability: 0,
        action: "fail",
      };
    }

    const key = stateKey(slotsRemaining, attackGain);
    const cached = evaluations.get(key);
    if (cached) return cached;

    let best: StateEvaluation = {
      objectiveValue: 0,
      expectedCost: 0,
      successProbability: 0,
      action: "abandon",
    };

    for (const scroll of scrolls) {
      const successState = evaluate(
        slotsRemaining - 1,
        attackGain + scroll.attackGain,
      );
      const failureState = evaluate(slotsRemaining - 1, attackGain);
      const candidate: StateEvaluation = {
        objectiveValue:
          scroll.cost +
          scroll.successRate * successState.objectiveValue +
          (1 - scroll.successRate) * failureState.objectiveValue,
        expectedCost:
          scroll.cost +
          scroll.successRate * successState.expectedCost +
          (1 - scroll.successRate) * failureState.expectedCost,
        successProbability:
          scroll.successRate * successState.successProbability +
          (1 - scroll.successRate) * failureState.successProbability,
        action: scroll.kind,
      };

      if (compareEvaluations(candidate, best) < 0) {
        best = candidate;
      }
    }

    evaluations.set(key, best);
    return best;
  }

  const root = evaluate(config.slots, 0);
  return {
    attemptCost: config.weaponCost + root.expectedCost,
    successProbability: root.successProbability,
    objectiveValue: config.weaponCost + root.objectiveValue,
    evaluations,
  };
}

function collectReachableDecisions(
  config: CalculatorConfig,
  evaluations: Map<string, StateEvaluation>,
): AdaptiveDecision[] {
  const scrollsByKind = new Map(getScrolls(config).map((scroll) => [scroll.kind, scroll]));
  const decisions = new Map<string, AdaptiveDecision>();

  function visit(
    slotsRemaining: number,
    attackGain: number,
    stateProbability: number,
  ): void {
    if (stateProbability <= 0 || attackGain >= config.targetAttackGain || slotsRemaining === 0) {
      return;
    }

    const key = stateKey(slotsRemaining, attackGain);
    const evaluation = evaluations.get(key);
    if (!evaluation) return;

    const existing = decisions.get(key);
    if (existing) {
      existing.stateProbability += stateProbability;
    } else {
      decisions.set(key, {
        slotsUsed: config.slots - slotsRemaining,
        slotsRemaining,
        attackGain,
        stateProbability,
        action: evaluation.action,
        expectedRemainingCost: evaluation.expectedCost,
        successProbability: evaluation.successProbability,
      });
    }

    const scroll = scrollsByKind.get(evaluation.action as ScrollKind);
    if (!scroll) return;

    visit(
      slotsRemaining - 1,
      attackGain + scroll.attackGain,
      stateProbability * scroll.successRate,
    );
    visit(
      slotsRemaining - 1,
      attackGain,
      stateProbability * (1 - scroll.successRate),
    );
  }

  visit(config.slots, 0, 1);

  return [...decisions.values()].sort((a, b) => {
    if (a.slotsUsed !== b.slotsUsed) return a.slotsUsed - b.slotsUsed;
    return a.attackGain - b.attackGain;
  });
}

export function calculateAdaptiveStrategy(config: CalculatorConfig): AdaptiveStrategyResult | null {
  const fixedBest = findBestStrategy(config);
  if (!fixedBest) return null;

  let lambda = fixedBest.expectedCostPerSuccess;
  let solveResult = solveForLambda(config, lambda);
  let iterations = 0;

  for (; iterations < 100; iterations += 1) {
    if (solveResult.successProbability <= 0) return null;

    const nextLambda = solveResult.attemptCost / solveResult.successProbability;
    if (Math.abs(nextLambda - lambda) < 1e-7) {
      lambda = nextLambda;
      break;
    }

    lambda = nextLambda;
    solveResult = solveForLambda(config, lambda);
  }

  solveResult = solveForLambda(config, lambda);

  const decisions = collectReachableDecisions(config, solveResult.evaluations);
  return {
    attemptCost: solveResult.attemptCost,
    successProbability: solveResult.successProbability,
    expectedCostPerSuccess: solveResult.attemptCost / solveResult.successProbability,
    decisions,
    abandonStates: decisions.filter(({ action }) => action === "abandon"),
    iterations: iterations + 1,
  };
}

function parseNumberArg(args: string[], name: string, fallback: number): number {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;

  const value = Number(args[index + 1]);
  return Number.isFinite(value) ? value : fallback;
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

function printStrategy(strategy: StrategyResult): void {
  console.log(
    [
      `${strategy.tenPercentScrolls}x 10%`,
      `${strategy.sixtyPercentScrolls}x 60%`,
      `attempt=${formatMoney(strategy.attemptCost)}`,
      `prob=${formatPercent(strategy.successProbability)}`,
      `expected=${formatMoney(strategy.expectedCostPerSuccess)}`,
    ].join(" | "),
  );
}

function runFromCli(args: string[]): void {
  const config: CalculatorConfig = {
    slots: parseNumberArg(args, "slots", DEFAULT_CONFIG.slots),
    targetAttackGain: parseNumberArg(args, "target", DEFAULT_CONFIG.targetAttackGain),
    weaponCost: parseNumberArg(args, "weapon", DEFAULT_CONFIG.weaponCost),
    tenPercentScrollCost: parseNumberArg(
      args,
      "scroll10",
      DEFAULT_CONFIG.tenPercentScrollCost,
    ),
    sixtyPercentScrollCost: parseNumberArg(
      args,
      "scroll60",
      DEFAULT_CONFIG.sixtyPercentScrollCost,
    ),
  };

  const strategies = calculateStrategies(config);
  const bestStrategy = strategies.find(({ successProbability }) => successProbability > 0);

  console.log(
    `Target: attack gain >= ${config.targetAttackGain}, slots=${config.slots}`,
  );
  console.log(
    `Costs: weapon=${formatMoney(config.weaponCost)}, 10%=${formatMoney(
      config.tenPercentScrollCost,
    )}, 60%=${formatMoney(config.sixtyPercentScrollCost)}`,
  );
  console.log("");

  if (!bestStrategy) {
    console.log("No strategy can reach the target.");
    return;
  }

  console.log("Best strategy by expected cost per success:");
  printStrategy(bestStrategy);
  console.log("");
  console.log("All strategies:");
  strategies.forEach(printStrategy);
}

if (typeof process !== "undefined" && /base\.(ts|js)$/.test(process.argv[1] ?? "")) {
  runFromCli(process.argv.slice(2));
}
