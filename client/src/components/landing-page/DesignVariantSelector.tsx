// components/landing-page/DesignVariantSelector.tsx
"use client";

import { motion } from "framer-motion";
import { DESIGN_VARIANTS } from "../../../lib/landing-page-generator";

interface DesignVariantSelectorProps {
  selected: string;
  onSelect: (variantId: string) => void;
}

export default function DesignVariantSelector({
  selected,
  onSelect,
}: DesignVariantSelectorProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {DESIGN_VARIANTS.map((variant) => (
        <motion.button
          key={variant.id}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelect(variant.id)}
          className={`p-6 rounded-2xl border-2 transition-all text-left ${
            selected === variant.id
              ? "border-primary bg-primary/5 shadow-lg"
              : "border-border hover:border-primary/50"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold">{variant.name}</h3>
            {selected === variant.id && (
              <span className="text-primary text-xl">✓</span>
            )}
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            {variant.description}
          </p>

          {/* Color Swatches */}
          <div className="flex gap-2">
            {Object.values(variant.colorScheme)
              .slice(0, 3)
              .map((color, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full border-2 border-white shadow-sm"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
          </div>
        </motion.button>
      ))}
    </div>
  );
}
