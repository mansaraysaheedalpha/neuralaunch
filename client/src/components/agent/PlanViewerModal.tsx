"use client";
import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface PlanViewerModalProps {
  children: ReactNode; // This will be the trigger button
  planComponent: ReactNode; // This is where we'll pass in the AgentPlanner
}

export default function PlanViewerModal({
  children,
  planComponent,
}: PlanViewerModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* 1. The Trigger Button */}
      <div onClick={() => setIsOpen(true)}>{children}</div>

      {/* 2. The Modal */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />

            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="relative z-10 w-full max-w-3xl rounded-lg bg-card shadow-xl border border-border"
            >
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h3 className="text-lg font-semibold text-foreground">
                  Full Architectural Plan
                </h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="h-[70vh] overflow-y-auto p-4">
                {planComponent}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
