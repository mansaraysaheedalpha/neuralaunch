-- AddForeignKey
ALTER TABLE "ExecutionWave" ADD CONSTRAINT "ExecutionWave_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ProjectContext"("projectId") ON DELETE CASCADE ON UPDATE CASCADE;
