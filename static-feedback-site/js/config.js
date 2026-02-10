const appConfig = {
    voting: {
        // Set to true to enable the voting section and expand it by default
        // 设置为 true 以启用投票部分并默认展开
        hasNewVote: false,

        // The URL for the voting form or page
        // 投票表单或页面的 URL
        voteLink: "https://github.com/your-repo/discussions/votes",

        // Button text when a vote is active (optional override)
        // 投票活动时的按钮文本（可选覆盖）
        title: {
            en: "Vote Now",
            zh: "立即投票"
        }
    }
};
