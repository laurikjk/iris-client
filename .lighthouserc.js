module.exports = {
  ci: {
    collect: {
      startServerCommand: "yarn build && yarn preview",
      url: ["http://localhost:3000"],
      numberOfRuns: 3,
      settings: {
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
        throttling: {
          rttMs: 150,
          throughputKbps: 1638.4,
          cpuSlowdownMultiplier: 2,
        },
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", {minScore: 0.9}],
        "categories:accessibility": ["error", {minScore: 0.9}],
        "categories:best-practices": ["error", {minScore: 0.9}],
        "categories:seo": ["error", {minScore: 0.9}],
      },
    },
  },
}
