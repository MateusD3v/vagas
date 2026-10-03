-- CreateTable
CREATE TABLE "DailyAnalysisBudget" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyAnalysisBudget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyAnalysisBudget_date_key" ON "DailyAnalysisBudget"("date");
