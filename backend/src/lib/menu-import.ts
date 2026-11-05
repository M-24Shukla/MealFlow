import { z } from "zod";

export const menuInput = z.object({
  items: z.array(
    z.object({
      name: z.string().trim().min(1).max(120),
      category: z.enum(["VEG", "NON_VEG", "EGG", "VEGAN"]),
      recipeUrl: z
        .string()
        .url()
        .refine((url) => /^https?:\/\//.test(url), "Use an HTTP(S) recipe URL.")
        .nullable()
        .optional(),
      notes: z.string().trim().max(1000).nullable().optional(),
    }),
  ),
});

export const menuImportInput = z
  .object({
    menus: z
      .array(
        z
          .object({
            weekday: z.number().int().min(1).max(7),
            mealType: z.enum([
              "BREAKFAST",
              "BRUNCH",
              "LUNCH",
              "SNACKS",
              "DINNER",
            ]),
            items: z
              .array(menuInput.shape.items.element.strict())
              .min(1)
              .max(50),
          })
          .strict(),
      )
      .min(1)
      .max(35),
  })
  .strict()
  .superRefine(({ menus }, context) => {
    const seen = new Set<string>();
    menus.forEach((menu, index) => {
      const key = `${menu.weekday}:${menu.mealType}`;
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["menus", index],
          message: "Each weekday and meal combination must appear only once.",
        });
      }
      seen.add(key);
    });
  });
