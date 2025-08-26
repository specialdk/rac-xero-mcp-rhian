// RAC Financial Dashboard - Complete Server.js with Date Picker Support
// Includes all functionality: Database Token Storage, Trial Balance with Date Support, Multi-entity Integration
// RAC Financial Dashboard - Complete Server.js with Date Picker Support
// Includes all functionality: Database Token Storage, Trial Balance with Date Support, Multi-entity Integration

// Add these endpoints to your existing server.js after your current API routes

// ============================================================================
// ENHANCED MCP ANALYSIS ENDPOINTS
// ============================================================================

// Get manual journal entries for analysis
app.get('/api/journal-entries/:tenantId', async (req, res) => {
  try {
    const tokenData = await tokenStorage.getXeroToken(req.params.tenantId);
    if (!tokenData) {
      return res.status(404).json({ error: 'Tenant not found or token expired' });
    }

    await xero.setTokenSet(tokenData);

    // Get date range from query parameters
    const dateFrom = req.query.dateFrom || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 1 year ago
    const dateTo = req.query.dateTo || new Date().toISOString().split('T')[0];
    const accountName = req.query.accountName;

    console.log(`Getting journal entries for ${tokenData.tenantName} from ${dateFrom} to ${dateTo}`);

    // Get manual journals from Xero
    const response = await xero.accountingApi.getManualJournals(
      req.params.tenantId,
      null, // ifModifiedSince
      `Date >= DateTime(${dateFrom.replace(/-/g, ',')}) AND Date <= DateTime(${dateTo.replace(/-/g, ',')})` // where clause
    );

    const journals = response.body.manualJournals || [];
    
    // Filter and analyze journals
    const analysisResults = journals.map(journal => {
      const journalLines = journal.journalLines || [];
      
      // Calculate total debits and credits
      const totalDebits = journalLines
        .filter(line => line.lineAmount > 0)
        .reduce((sum, line) => sum + line.lineAmount, 0);
      
      const totalCredits = journalLines
        .filter(line => line.lineAmount < 0)
        .reduce((sum, line) => sum + Math.abs(line.lineAmount), 0);

      const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;
      
      // Check if this journal affects the specified account
      const affectsAccount = accountName ? 
        journalLines.some(line => 
          line.accountCode && line.accountCode.toLowerCase().includes(accountName.toLowerCase())
        ) : true;

      if (!affectsAccount) return null;

      return {
        journalID: journal.manualJournalID,
        journalNumber: journal.journalNumber,
        reference: journal.reference,
        date: journal.date,
        status: journal.status,
        totalDebits,
        totalCredits,
        isBalanced,
        imbalanceAmount: totalDebits - totalCredits,
        lineCount: journalLines.length,
        journalLines: journalLines.map(line => ({
          accountCode: line.accountCode,
          accountName: line.accountName,
          description: line.description,
          lineAmount: line.lineAmount,
          trackingCategories: line.trackingCategories
        })),
        // Flag suspicious entries
        isSuspicious: !isBalanced || 
                     Math.abs(totalDebits) > 1000000 || // Large amounts
                     journalLines.length === 1 || // Single-sided entries
                     journalLines.some(line => 
                       line.accountName && 
                       line.accountName.toLowerCase().includes('future fund')
                     )
      };
    }).filter(j => j !== null);

    // Sort by date (newest first)
    analysisResults.sort((a, b) => new Date(b.date) - new Date(a.date));

    console.log(`Found ${analysisResults.length} journal entries, ${analysisResults.filter(j => j.isSuspicious).length} flagged as suspicious`);

    res.json({
      tenantId: req.params.tenantId,
      tenantName: tokenData.tenantName,
      dateFrom,
      dateTo,
      totalJournals: analysisResults.length,
      suspiciousJournals: analysisResults.filter(j => j.isSuspicious).length,
      unbalancedJournals: analysisResults.filter(j => !j.isBalanced).length,
      journals: analysisResults
    });

  } catch (error) {
    console.error('Error getting journal entries:', error);
    res.status(500).json({ 
      error: 'Failed to get journal entries', 
      details: error.message 
    });
  }
});

// Analyze equity account movements
app.get('/api/equity-analysis/:tenantId', async (req, res) => {
  try {
    const tokenData = await tokenStorage.getXeroToken(req.params.tenantId);
    if (!tokenData) {
      return res.status(404).json({ error: 'Tenant not found or token expired' });
    }

    await xero.setTokenSet(tokenData);

    const equityAccountName = req.query.equityAccountName || 'Future Fund';
    const monthsBack = parseInt(req.query.monthsBack) || 12;

    console.log(`Analyzing equity movements for ${equityAccountName} over ${monthsBack} months`);

    // Get accounts first to find the equity account ID
    const accountsResponse = await xero.accountingApi.getAccounts(
      req.params.tenantId,
      null,
      `Type=="EQUITY" AND Name.Contains("${equityAccountName}")`
    );

    const equityAccounts = accountsResponse.body.accounts || [];
    
    if (equityAccounts.length === 0) {
      return res.json({
        error: `No equity account found matching "${equityAccountName}"`,
        tenantName: tokenData.tenantName,
        searchTerm: equityAccountName
      });
    }

    const results = [];
    
    for (const account of equityAccounts) {
      // Get account transactions - this requires a different API call
      // Note: Xero's API has limitations on transaction history
      try {
        const today = new Date();
        const startDate = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);
        
        // We'll need to get this data from manual journals since direct account transactions
        // are limited in Xero API
        const journalResponse = await xero.accountingApi.getManualJournals(
          req.params.tenantId,
          null,
          `Date >= DateTime(${startDate.getFullYear()},${startDate.getMonth() + 1},${startDate.getDate()})`
        );

        const relevantJournals = (journalResponse.body.manualJournals || [])
          .filter(journal => 
            journal.journalLines && 
            journal.journalLines.some(line => 
              line.accountCode === account.code ||
              (line.accountName && line.accountName.toLowerCase().includes(equityAccountName.toLowerCase()))
            )
          )
          .map(journal => ({
            journalID: journal.manualJournalID,
            journalNumber: journal.journalNumber,
            date: journal.date,
            reference: journal.reference,
            status: journal.status,
            relevantLines: journal.journalLines.filter(line =>
              line.accountCode === account.code ||
              (line.accountName && line.accountName.toLowerCase().includes(equityAccountName.toLowerCase()))
            )
          }));

        results.push({
          accountID: account.accountID,
          accountCode: account.code,
          accountName: account.name,
          currentBalance: account.currentBalance || 0,
          accountType: account.type,
          status: account.status,
          transactionCount: relevantJournals.length,
          transactions: relevantJournals,
          // Calculate balance changes
          totalMovements: relevantJournals.reduce((sum, j) => 
            sum + j.relevantLines.reduce((lineSum, line) => lineSum + line.lineAmount, 0), 0
          )
        });

      } catch (accountError) {
        console.error(`Error analyzing account ${account.name}:`, accountError);
        results.push({
          accountID: account.accountID,
          accountCode: account.code,
          accountName: account.name,
          error: accountError.message
        });
      }
    }

    res.json({
      tenantId: req.params.tenantId,
      tenantName: tokenData.tenantName,
      analysisDate: new Date().toISOString(),
      searchTerm: equityAccountName,
      monthsAnalyzed: monthsBack,
      accountsFound: results.length,
      accounts: results
    });

  } catch (error) {
    console.error('Error analyzing equity movements:', error);
    res.status(500).json({ 
      error: 'Failed to analyze equity movements', 
      details: error.message 
    });
  }
});

// Get account transaction history
app.get('/api/account-history/:tenantId/:accountName', async (req, res) => {
  try {
    const tokenData = await tokenStorage.getXeroToken(req.params.tenantId);
    if (!tokenData) {
      return res.status(404).json({ error: 'Tenant not found or token expired' });
    }

    await xero.setTokenSet(tokenData);

    const accountName = decodeURIComponent(req.params.accountName);
    const dateFrom = req.query.dateFrom;
    const dateTo = req.query.dateTo;

    console.log(`Getting account history for: ${accountName}`);

    // First, find the account
    const accountsResponse = await xero.accountingApi.getAccounts(
      req.params.tenantId,
      null,
      `Name.Contains("${accountName}")`
    );

    const accounts = accountsResponse.body.accounts || [];
    const matchingAccount = accounts.find(acc => 
      acc.name.toLowerCase() === accountName.toLowerCase() ||
      acc.name.toLowerCase().includes(accountName.toLowerCase())
    );

    if (!matchingAccount) {
      return res.json({
        error: `Account "${accountName}" not found`,
        tenantName: tokenData.tenantName,
        availableAccounts: accounts.slice(0, 10).map(a => a.name)
      });
    }

    // Get journals that affect this account
    let whereClause = '';
    if (dateFrom && dateTo) {
      whereClause = `Date >= DateTime(${dateFrom.replace(/-/g, ',')}) AND Date <= DateTime(${dateTo.replace(/-/g, ',')})`;
    }

    const journalResponse = await xero.accountingApi.getManualJournals(
      req.params.tenantId,
      null,
      whereClause
    );

    const relevantJournals = (journalResponse.body.manualJournals || [])
      .filter(journal => 
        journal.journalLines && 
        journal.journalLines.some(line => 
          line.accountCode === matchingAccount.code ||
          (line.accountName && line.accountName.toLowerCase().includes(accountName.toLowerCase()))
        )
      )
      .map(journal => {
        const relevantLines = journal.journalLines.filter(line =>
          line.accountCode === matchingAccount.code ||
          (line.accountName && line.accountName.toLowerCase().includes(accountName.toLowerCase()))
        );

        return {
          journalID: journal.manualJournalID,
          journalNumber: journal.journalNumber,
          date: journal.date,
          reference: journal.reference,
          status: journal.status,
          description: journal.narration,
          relevantLines: relevantLines,
          netAmount: relevantLines.reduce((sum, line) => sum + line.lineAmount, 0)
        };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      tenantId: req.params.tenantId,
      tenantName: tokenData.tenantName,
      account: {
        accountID: matchingAccount.accountID,
        accountCode: matchingAccount.code,
        accountName: matchingAccount.name,
        accountType: matchingAccount.type,
        currentBalance: matchingAccount.currentBalance || 0,
        status: matchingAccount.status
      },
      dateFrom: dateFrom || 'All time',
      dateTo: dateTo || 'All time', 
      transactionCount: relevantJournals.length,
      transactions: relevantJournals,
      totalMovement: relevantJournals.reduce((sum, t) => sum + Math.abs(t.netAmount), 0)
    });

  } catch (error) {
    console.error('Error getting account history:', error);
    res.status(500).json({ 
      error: 'Failed to get account history', 
      details: error.message 
    });
  }
});

// Find unbalanced transactions
app.get('/api/find-unbalanced/:tenantId', async (req, res) => {
  try {
    const tokenData = await tokenStorage.getXeroToken(req.params.tenantId);
    if (!tokenData) {
      return res.status(404).json({ error: 'Tenant not found or token expired' });
    }

    await xero.setTokenSet(tokenData);

    const minimumAmount = parseFloat(req.query.minimumAmount) || 10000;
    const dateRange = req.query.dateRange || '1year';

    // Calculate date range
    const today = new Date();
    let startDate = new Date();
    
    switch(dateRange) {
      case '3months':
        startDate.setMonth(today.getMonth() - 3);
        break;
      case '1year':
        startDate.setFullYear(today.getFullYear() - 1);
        break;
      case 'all':
        startDate = new Date('2000-01-01');
        break;
      default:
        startDate.setFullYear(today.getFullYear() - 1);
    }

    console.log(`Finding unbalanced transactions >= $${minimumAmount} since ${startDate.toISOString().split('T')[0]}`);

    const whereClause = `Date >= DateTime(${startDate.getFullYear()},${startDate.getMonth() + 1},${startDate.getDate()})`;
    
    const journalResponse = await xero.accountingApi.getManualJournals(
      req.params.tenantId,
      null,
      whereClause
    );

    const journals = journalResponse.body.manualJournals || [];
    
    const unbalancedTransactions = journals
      .map(journal => {
        const journalLines = journal.journalLines || [];
        
        const totalDebits = journalLines
          .filter(line => line.lineAmount > 0)
          .reduce((sum, line) => sum + line.lineAmount, 0);
        
        const totalCredits = journalLines
          .filter(line => line.lineAmount < 0)
          .reduce((sum, line) => sum + Math.abs(line.lineAmount), 0);

        const imbalance = totalDebits - totalCredits;
        const isUnbalanced = Math.abs(imbalance) >= minimumAmount;
        const hasLargeAmount = Math.max(totalDebits, totalCredits) >= minimumAmount;
        
        if (!isUnbalanced && !hasLargeAmount) return null;

        return {
          journalID: journal.manualJournalID,
          journalNumber: journal.journalNumber,
          reference: journal.reference,
          date: journal.date,
          status: journal.status,
          totalDebits,
          totalCredits,
          imbalanceAmount: imbalance,
          isUnbalanced,
          severity: Math.abs(imbalance) > 1000000 ? 'CRITICAL' : 
                   Math.abs(imbalance) > 100000 ? 'HIGH' : 'MEDIUM',
          journalLines: journalLines.map(line => ({
            accountCode: line.accountCode,
            accountName: line.accountName,
            description: line.description,
            lineAmount: line.lineAmount
          })),
          flags: {
            largeAmount: Math.max(totalDebits, totalCredits) > 1000000,
            unbalanced: isUnbalanced,
            singleSided: journalLines.length === 1,
            affectsFutureFund: journalLines.some(line => 
              line.accountName && line.accountName.toLowerCase().includes('future fund')
            )
          }
        };
      })
      .filter(j => j !== null)
      .sort((a, b) => Math.abs(b.imbalanceAmount) - Math.abs(a.imbalanceAmount));

    res.json({
      tenantId: req.params.tenantId,
      tenantName: tokenData.tenantName,
      analysisDate: new Date().toISOString(),
      criteria: {
        minimumAmount,
        dateRange,
        startDate: startDate.toISOString().split('T')[0]
      },
      summary: {
        totalJournalsAnalyzed: journals.length,
        unbalancedFound: unbalancedTransactions.filter(t => t.isUnbalanced).length,
        largeAmountFound: unbalancedTransactions.filter(t => t.flags.largeAmount).length,
        criticalIssues: unbalancedTransactions.filter(t => t.severity === 'CRITICAL').length,
        futureFundRelated: unbalancedTransactions.filter(t => t.flags.affectsFutureFund).length
      },
      transactions: unbalancedTransactions
    });

  } catch (error) {
    console.error('Error finding unbalanced transactions:', error);
    res.status(500).json({ 
      error: 'Failed to find unbalanced transactions', 
      details: error.message 
    });
  }
});

// Get complete chart of accounts
app.get('/api/chart-of-accounts/:tenantId', async (req, res) => {
  try {
    const tokenData = await tokenStorage.getXeroToken(req.params.tenantId);
    if (!tokenData) {
      return res.status(404).json({ error: 'Tenant not found or token expired' });
    }

    await xero.setTokenSet(tokenData);

    const accountType = req.query.accountType;
    const includeArchived = req.query.includeArchived === 'true';

    let whereClause = '';
    if (accountType) {
      whereClause = `Type=="${accountType}"`;
    }
    if (!includeArchived) {
      whereClause += whereClause ? ' AND Status=="ACTIVE"' : 'Status=="ACTIVE"';
    }

    console.log(`Getting chart of accounts for ${tokenData.tenantName}`);

    const response = await xero.accountingApi.getAccounts(
      req.params.tenantId,
      null,
      whereClause
    );

    const accounts = response.body.accounts || [];
    
    // Analyze accounts for unusual patterns
    const analysis = accounts.map(account => {
      const balance = parseFloat(account.currentBalance) || 0;
      const isLargeBalance = Math.abs(balance) > 1000000;
      const isUnusualEquity = account.type === 'EQUITY' && 
                            (account.name.toLowerCase().includes('future fund') ||
                             account.name.toLowerCase().includes('reserve') ||
                             Math.abs(balance) > 10000000);

      return {
        accountID: account.accountID,
        code: account.code,
        name: account.name,
        type: account.type,
        class: account.class,
        status: account.status,
        currentBalance: balance,
        description: account.description,
        systemAccount: account.systemAccount,
        flags: {
          largeBalance: isLargeBalance,
          unusualEquity: isUnusualEquity,
          zeroBalance: balance === 0,
          negativeAsset: account.type === 'ASSET' && balance < 0,
          positiveExpense: account.type === 'EXPENSE' && balance > 0
        }
      };
    });

    // Group by account type
    const groupedAccounts = {
      ASSET: analysis.filter(a => a.type === 'ASSET'),
      LIABILITY: analysis.filter(a => a.type === 'LIABILITY'),
      EQUITY: analysis.filter(a => a.type === 'EQUITY'),
      REVENUE: analysis.filter(a => a.type === 'REVENUE'),
      EXPENSE: analysis.filter(a => a.type === 'EXPENSE'),
      OTHER: analysis.filter(a => !['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].includes(a.type))
    };

    res.json({
      tenantId: req.params.tenantId,
      tenantName: tokenData.tenantName,
      filters: {
        accountType: accountType || 'All',
        includeArchived
      },
      summary: {
        totalAccounts: accounts.length,
        activeAccounts: analysis.filter(a => a.status === 'ACTIVE').length,
        archivedAccounts: analysis.filter(a => a.status === 'ARCHIVED').length,
        largeBalanceAccounts: analysis.filter(a => a.flags.largeBalance).length,
        unusualEquityAccounts: analysis.filter(a => a.flags.unusualEquity).length,
        accountsByType: {
          ASSET: groupedAccounts.ASSET.length,
          LIABILITY: groupedAccounts.LIABILITY.length,
          EQUITY: groupedAccounts.EQUITY.length,
          REVENUE: groupedAccounts.REVENUE.length,
          EXPENSE: groupedAccounts.EXPENSE.length,
          OTHER: groupedAccounts.OTHER.length
        }
      },
      accounts: groupedAccounts,
      flaggedAccounts: analysis.filter(a => 
        a.flags.largeBalance || 
        a.flags.unusualEquity || 
        a.flags.negativeAsset || 
        a.flags.positiveExpense
      )
    });

  } catch (error) {
    console.error('Error getting chart of accounts:', error);
    res.status(500).json({ 
      error: 'Failed to get chart of accounts', 
      details: error.message 
    });
  }
});

// Compare trial balance between periods
app.get('/api/compare-periods/:tenantId', async (req, res) => {
  try {
    const tokenData = await tokenStorage.getXeroToken(req.params.tenantId);
    if (!tokenData) {
      return res.status(404).json({ error: 'Tenant not found or token expired' });
    }

    const fromDate = req.query.fromDate;
    const toDate = req.query.toDate || new Date().toISOString().split('T')[0];
    const accountFilter = req.query.accountFilter;

    if (!fromDate) {
      return res.status(400).json({ error: 'fromDate parameter is required' });
    }

    console.log(`Comparing periods: ${fromDate} vs ${toDate} for ${tokenData.tenantName}`);

    // Get trial balance for both periods by calling our existing endpoint
    const [fromPeriodResponse, toPeriodResponse] = await Promise.all([
      fetch(`${req.protocol}://${req.get('host')}/api/trial-balance/${req.params.tenantId}?date=${fromDate}`),
      fetch(`${req.protocol}://${req.get('host')}/api/trial-balance/${req.params.tenantId}?date=${toDate}`)
    ]);

    if (!fromPeriodResponse.ok || !toPeriodResponse.ok) {
      throw new Error('Failed to retrieve trial balance data for comparison');
    }

    const fromPeriodData = await fromPeriodResponse.json();
    const toPeriodData = await toPeriodResponse.json();

    // Compare the periods
    const comparison = {
      tenantId: req.params.tenantId,
      tenantName: tokenData.tenantName,
      fromDate,
      toDate,
      fromPeriod: {
        totalAssets: fromPeriodData.trialBalance.totals.totalAssets,
        totalLiabilities: fromPeriodData.trialBalance.totals.totalLiabilities,
        totalEquity: fromPeriodData.trialBalance.totals.totalEquity,
        totalDebits: fromPeriodData.trialBalance.totals.totalDebits,
        totalCredits: fromPeriodData.trialBalance.totals.totalCredits,
        balanced: fromPeriodData.balanceCheck.debitsEqualCredits
      },
      toPeriod: {
        totalAssets: toPeriodData.trialBalance.totals.totalAssets,
        totalLiabilities: toPeriodData.trialBalance.totals.totalLiabilities,
        totalEquity: toPeriodData.trialBalance.totals.totalEquity,
        totalDebits: toPeriodData.trialBalance.totals.totalDebits,
        totalCredits: toPeriodData.trialBalance.totals.totalCredits,
        balanced: toPeriodData.balanceCheck.debitsEqualCredits
      },
      changes: {
        assetsChange: toPeriodData.trialBalance.totals.totalAssets - fromPeriodData.trialBalance.totals.totalAssets,
        liabilitiesChange: toPeriodData.trialBalance.totals.totalLiabilities - fromPeriodData.trialBalance.totals.totalLiabilities,
        equityChange: toPeriodData.trialBalance.totals.totalEquity - fromPeriodData.trialBalance.totals.totalEquity,
        balanceStatusChange: toPeriodData.balanceCheck.debitsEqualCredits !== fromPeriodData.balanceCheck.debitsEqualCredits
      }
    };

    // Find accounts with significant changes
    const fromAccounts = [...fromPeriodData.trialBalance.assets, ...fromPeriodData.trialBalance.liabilities, ...fromPeriodData.trialBalance.equity];
    const toAccounts = [...toPeriodData.trialBalance.assets, ...toPeriodData.trialBalance.liabilities, ...toPeriodData.trialBalance.equity];
    
    const accountChanges = [];
    
    // Find changes in existing accounts
    fromAccounts.forEach(fromAcc => {
      const toAcc = toAccounts.find(a => a.name === fromAcc.name);
      if (toAcc) {
        const change = toAcc.balance - fromAcc.balance;
        if (Math.abs(change) > 1000) { // Only show changes > $1,000
          accountChanges.push({
            accountName: fromAcc.name,
            fromBalance: fromAcc.balance,
            toBalance: toAcc.balance,
            change: change,
            changeType: change > 0 ? 'INCREASE' : 'DECREASE'
          });
        }
      }
    });

    // Find new accounts
    toAccounts.forEach(toAcc => {
      const fromAcc = fromAccounts.find(a => a.name === toAcc.name);
      if (!fromAcc && Math.abs(toAcc.balance) > 1000) {
        accountChanges.push({
          accountName: toAcc.name,
          fromBalance: 0,
          toBalance: toAcc.balance,
          change: toAcc.balance,
          changeType: 'NEW_ACCOUNT'
        });
      }
    });

    // Sort by magnitude of change
    accountChanges.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    comparison.accountChanges = accountChanges;
    comparison.significantChanges = accountChanges.filter(c => Math.abs(c.change) > 100000);

    res.json(comparison);

  } catch (error) {
    console.error('Error comparing periods:', error);
    res.status(500).json({ 
      error: 'Failed to compare periods', 
      details: error.message 
    });
  }
});