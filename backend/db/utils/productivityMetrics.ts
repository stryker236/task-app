function localDayKey(value: string | Date = new Date()) {
	const date = value instanceof Date ? value : new Date(value);
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, '0'),
		String(date.getDate()).padStart(2, '0')
	].join('-');
}

function startOfLocalDay(value = new Date()) {
	const date = new Date(value);
	date.setHours(0, 0, 0, 0);
	return date;
}

function addDays(value: Date, days: number) {
	const date = new Date(value);
	date.setDate(date.getDate() + days);
	return date;
}

function buildStreak(dayXp: Map<string, number>, dailyGoalXp: number) {
	const today = startOfLocalDay();
	let currentStreak = 0;
	for (let offset = 0; offset < 366; offset += 1) {
		const key = localDayKey(addDays(today, -offset));
		if ((dayXp.get(key) || 0) < dailyGoalXp) break;
		currentStreak += 1;
	}

	let longestStreak = 0;
	let running = 0;
	for (let offset = 365; offset >= 0; offset -= 1) {
		const key = localDayKey(addDays(today, -offset));
		if ((dayXp.get(key) || 0) >= dailyGoalXp) {
			running += 1;
			longestStreak = Math.max(longestStreak, running);
		} else {
			running = 0;
		}
	}
	return { currentStreak, longestStreak };
}

module.exports = {
	addDays,
	buildStreak,
	localDayKey,
	startOfLocalDay
};

export {};

