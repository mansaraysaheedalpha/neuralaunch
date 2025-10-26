// components/landing-page/DesignVariantSelector.tsx
"use client";

import { motion } from "framer-motion";
import { DESIGN_VARIANTS } from "../../../lib/landing-page-generator";
import { Check, Palette } from "lucide-react";

interface DesignVariantSelectorProps {
  selected: string;
  onSelect: (variantId: string) => void;
}

export default function DesignVariantSelector({
  selected,
  onSelect,
}: DesignVariantSelectorProps) {
  return (
    <div className="space-y-3">
      {DESIGN_VARIANTS.map((variant, index) => (
        <motion.button
          key={variant.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          whileHover={{ scale: 1.01, x: 4 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => onSelect(variant.id)}
          className={`w-full p-4 rounded-xl border-2 transition-all text-left group relative overflow-hidden ${
            selected === variant.id
              ? "border-primary bg-primary/10 shadow-md"
              : "border-border hover:border-primary/40 hover:shadow-sm"
          }`}
        >
          {/* Background gradient on hover */}
          <div 
            className="absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity"
            style={{ 
              background: `linear-gradient(135deg, ${variant.colorScheme.primary}, ${variant.colorScheme.secondary})` 
            }}
          />
          
          <div className="relative flex items-center gap-4">
            {/* Color palette preview */}
            <div className="flex-shrink-0 relative">
              <div className="flex gap-1.5">
                {Object.values(variant.colorScheme)
                  .slice(0, 3)
                  .map((color, i) => (
                    <motion.div
                      key={i}
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: index * 0.05 + i * 0.05 }}
                      className="w-6 h-6 rounded-md border border-white/50 shadow-sm"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
              </div>
              {/* Palette icon overlay on hover */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Palette className="w-4 h-4 text-primary" />
              </div>
            </div>

            {/* Variant info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-bold truncate">{variant.name}</h3>
                {selected === variant.id && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="flex-shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center"
                  >
                    <Check className="w-3 h-3 text-primary-foreground" />
                  </motion.div>
                )}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1">
                {variant.description}
              </p>
            </div>

            {/* Selection indicator */}
            {selected === variant.id && (
              <motion.div
                layoutId="selectedIndicator"
                className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
          </div>
        </motion.button>
      ))}
    </div>
  );
}
