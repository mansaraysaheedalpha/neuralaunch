import { motion } from "framer-motion";
import {
  FileText,
  Terminal,
  Lightbulb,
  CheckCircle,
  Code,
  Layout,
  Shield,
  Clock,
} from "lucide-react";
import type { ActionableTask } from "@/types/agent-schemas"; // Corrected import path

interface ActionableTaskItemProps {
  task: ActionableTask;
  index: number;
}

const fadeIn = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const IconWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="flex-shrink-0 w-5 h-5 text-muted-foreground">{children}</div>
);

export default function ActionableTaskItem({
  task,
  index,
}: ActionableTaskItemProps) {
  return (
    <motion.li
      variants={fadeIn}
      className="p-4 bg-card border border-border rounded-lg shadow-sm"
    >
      <h4 className="text-md font-semibold text-foreground mb-3">
        <span className="text-primary font-bold">{index + 1}.</span> {task.task}
      </h4>

      <div className="space-y-3 pl-6">
        {/* Rationale */}
        <div className="flex items-start gap-3">
          <IconWrapper>
            <Lightbulb />
          </IconWrapper>
          <p className="text-sm text-muted-foreground">
            <strong>Rationale:</strong> {task.rationale}
          </p>
        </div>

        {/* Files */}
        <div className="flex items-start gap-3">
          <IconWrapper>
            <FileText />
          </IconWrapper>
          <div>
            <strong className="text-sm text-muted-foreground">Files:</strong>
            <ul className="list-none pl-0 mt-1 space-y-1">
              {task.files.map((file) => (
                <li
                  key={file}
                  className="flex items-center gap-2 text-sm text-foreground"
                >
                  <Code className="w-4 h-4 text-sky-500" />
                  <span className="font-mono bg-muted px-2 py-0.5 rounded">
                    {file}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Pattern */}
        <div className="flex items-start gap-3">
          <IconWrapper>
            <Code />
          </IconWrapper>
          <p className="text-sm text-muted-foreground">
            <strong>Pattern:</strong>{" "}
            <span className="font-mono bg-muted px-2 py-0.5 rounded text-foreground">
              {task.pattern}
            </span>
          </p>
        </div>

        {/* UI Details (if present) */}
        {task.uiDetails && (
          <div className="flex items-start gap-3">
            <IconWrapper>
              <Layout />
            </IconWrapper>
            <p className="text-sm text-muted-foreground">
              <strong>UI Details:</strong> {task.uiDetails}
            </p>
          </div>
        )}

        {/* Security (if present) */}
        {task.security.length > 0 && (
          <div className="flex items-start gap-3">
            <IconWrapper>
              <Shield />
            </IconWrapper>
            <div>
              <strong className="text-sm text-muted-foreground">
                Security:
              </strong>
              <ul className="list-none pl-0 mt-1 space-y-1">
                {task.security.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-2 text-sm text-foreground"
                  >
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Complexity */}
        <div className="flex items-start gap-3">
          <IconWrapper>
            <Clock />
          </IconWrapper>
          <p className="text-sm text-muted-foreground">
            <strong>Complexity:</strong>
            <span
              className={`ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                task.estimatedComplexity === "high"
                  ? "bg-red-100 text-red-800"
                  : task.estimatedComplexity === "medium"
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-green-100 text-green-800"
              }`}
            >
              {task.estimatedComplexity}
            </span>
          </p>
        </div>

        {/* Verification */}
        <div className="flex items-start gap-3">
          <IconWrapper>
            <Terminal />
          </IconWrapper>
          <div>
            <strong className="text-sm text-muted-foreground">
              Verification:
            </strong>
            <div className="mt-1 font-mono text-xs bg-black text-green-400 p-3 rounded-md">
              <p className="mb-2 text-gray-400"># Commands to run:</p>
              {task.verification.commands.map((cmd) => (
                <p key={cmd}>
                  <span className="text-gray-500">$ </span>
                  {cmd}
                </p>
              ))}
              <p className="mt-3 text-gray-400"># Success Criteria:</p>
              <p className="text-green-300">
                {task.verification.successCriteria}
              </p>
            </div>
          </div>
        </div>
      </div>
    </motion.li>
  );
}
