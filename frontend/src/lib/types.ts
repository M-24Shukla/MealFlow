export type User = { id: string; email: string; displayName: string };

export type Group = {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  roles?: string[];
};

export type JoinRequest = {
  id: string;
  requestedRole: string;
  applicantName: string;
  applicantEmail: string;
};

export type MyJoinRequest = {
  id: string;
  groupName: string;
  requestedRole: string;
  status: string;
};

export type Member = {
  membershipId: string;
  displayName: string;
  email: string;
  roles: string[];
};

export type MenuItem = {
  id: string;
  name: string;
  category: string;
  recipeUrl: string | null;
  notes: string | null;
};

export type WeeklyMenu = {
  id: string;
  weekday: number;
  mealType: string;
  items: MenuItem[];
};

export type ActiveMeal = {
  date: string;
  mealType: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  items: MenuItem[];
};

export type Vacation = {
  id: string;
  startDate: string;
  startMeal: string;
  endDate: string;
  endMeal: string;
};

export type FoodInput = {
  name: string;
  category: string;
  recipeUrl: string;
  notes: string;
};
