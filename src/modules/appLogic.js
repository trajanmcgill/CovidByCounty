let appLogic = (function()
{
	const DataSource = "data/caseRecords.json?cacheBuster=" + (new Date()).getTime();
	
	const FIPS_Length = 5;

	const BasicFactType =
	{
		Cases: 0,
		Deaths: 2
	};
	
	const MeasurementType =
	{
		Absolute: 0,
		CaseRelative: 1,
		PopulationRelative: 2
	};

	const DataViewType =
	{
		DailyValue: 0,
		ChangeAbsolute: 1,
		ChangeProportional: 2
	};

	const AppWaitType =
	{
		None: 0,
		LoadingMap: 1,
		LoadingCaseData: 2,
		ProcessingCaseData: 3,
		BuildingVisualization: 4
	};
	
	const DefaultSingleValueColors =
		{
			Unknown: "rgb(80, 80, 80)",
			Zero: "rgb(128, 128, 128)",
			ExceedsMax: "rgb(0, 0, 255)"
		};
	const DefaultColorGradients =
		{
			negative:
				[
					{ start: "rgb(0, 255, 0)", end: "rgb(0, 255, 255)" }
				],
			positive: 
				[
					{ start: "rgb(255, 255, 255)", end: "rgb(255, 255, 0)" },
					{ start: "rgb(255, 255, 0)", end: "rgb(255, 0, 0)" },
					{ start: "rgb(255, 0, 0)", end: "rgb(77, 0, 153)" }
				]
		};
	const DefaultBasicFact = BasicFactType.Cases;
	const DefaultMeasurementType = MeasurementType.PopulationRelative;
	const DefaultDataView = DataViewType.DailyValue;
	const DefaultGrowthRangeDays = 1;
	const DefaultPopulationScale = 100000;
	const OverallStartDateUTC = new Date(Date.UTC(2000, 0, 1)); // All dates will be tracked as number of days since this date.
	
	let allCountyData = null;


	function getDateUTC(daysSinceStart)
	{
		let dateUTC = new Date(OverallStartDateUTC);
		dateUTC.setUTCDate(dateUTC.getUTCDate() + daysSinceStart);
		return dateUTC;
	} // end getDateUTC()


	function treatAsLocalDate(dateUTC)
	{
		let localDate = new Date(dateUTC.getUTCFullYear(), dateUTC.getUTCMonth(), dateUTC.getUTCDate());
		return localDate;
	}


	function getDateFromDateNumber(dateNumber)
	{
		return treatAsLocalDate(getDateUTC(dateNumber));
	}

	/*
	function cullCounties(validCountyList)
	{
		allCountyData.counties = allCountyData.counties.filter(county => countyFilterList.some(includedCounty => includedCounty.id = county.id));
	}
	*/

	function loadData(statusUpdateFunction, completionCallback)
	{
		statusUpdateFunction(AppWaitType.LoadingCaseData);
		fetch(DataSource)
			.then(response => response.json())
			.then(
				importedData =>
				{
					statusUpdateFunction(AppWaitType.ProcessingCaseData);
					allCountyData = importedData;
					importedData = null;
					console.log("county count=" + allCountyData.counties.length);
					console.log("about to call completionCallback");
					window.allCountyData = allCountyData; // REMOVE CODE HERE
					completionCallback();
				});
	} // end loadData()


	function getCountyByID(id)
	{
		if (typeof id === "string")
			id = parseInt(id, 10);
		if (typeof id === "number" && !isNaN(id))
		{
			let matchingCounty = allCountyData.counties.find(county => (county.id === id));
			if (matchingCounty !== undefined)
				return matchingCounty;
		}
		return null;
	} // end getCountyByID()


	function buildColoration_Positive(minValueGreaterThanZero, maxValue)
	{
		let dataRanges;
		if (minValueGreaterThanZero)
		{
			let maxMinRatio = maxValue / minValueGreaterThanZero;
			if (maxMinRatio > 10000)
			{
				let base = Math.cbrt(maxValue),
					secondPower = Math.pow(base, 2);
				dataRanges =
					[
						{ min: 0, max: base },
						{ min: base, max: secondPower },
						{ min: secondPower, max: maxValue }
					];
			}
			else if (maxMinRatio > 100)
			{
				let base = Math.sqrt(maxValue);
				dataRanges =
					[
						{ min: 0, max: base },
						{ min: base, max: maxValue }
					];
			}
			else
				dataRanges = [ { min: 0, max: maxValue }];
		}
		else
			dataRanges = [];
		
		let coloration =
			{
				zero: DefaultSingleValueColors.Zero,
				unknown: DefaultSingleValueColors.Unknown,
				exceedsMax: DefaultSingleValueColors.ExceedsMax,
				ranges: []
			};
		dataRanges.forEach(
			(dataRange, index) =>
			{
				coloration.ranges.push(
					{
						dataRange: dataRange,
						colorRange: DefaultColorGradients.positive[index]
					});
			});

		return coloration;
	} // end buildColoration_Positive()


	function buildColoration_Percentages(minValueGreaterThanZero, maxValue)
	{
		let coloration = buildColoration_Positive(minValueGreaterThanZero, maxValue);
		coloration.zero = null;
		coloration.ranges.unshift(
			{
				dataRange: { min: -1, max: 0 },
				colorRange: DefaultColorGradients.negative[0]
			});

		return coloration;
	} // end buildColoration_Percentages()


	function colorationIsValid(coloration)
	{
		if (typeof coloration === "undefined"
			|| coloration === null
			|| typeof coloration.unknown === "undefined"
			|| typeof coloration.zero === "undefined"
			|| typeof coloration.ranges !== "object"
			|| typeof coloration.ranges.length !== "number"
			|| coloration.ranges.length < 1)
		{
			return false;
		}
		return true;
	} // end colorationIsValid()


	function prepareDataForAnimation(basicFact, measurement, dataView, populationScale, growthRangeDays, coloration)
	{
		let animationData =
		{
			minValueGreaterThanZero: null,
			maxOverallDisplayFactValue: 0,
			firstDate: allCountyData.firstDate,
			lastDate: allCountyData.lastDate,
			counties: allCountyData.counties,
			coloration: coloration
		};

		animationData.counties.forEach(
			county =>
			{
				const countyPopulation = county.population;
				county.dailyRecords.forEach(
					(currentDailyRecord, index, dailyRecords) =>
					{
						const currentCases = currentDailyRecord.cases,
							currentDeaths = currentDailyRecord.deaths,
							previousRecordIndex = (growthRangeDays >= index) ? 0 : index - growthRangeDays,
							previousCases = (previousRecordIndex < 0) ? 0 : dailyRecords[previousRecordIndex].cases,
							previousDeaths = (previousRecordIndex < 0) ? 0 : dailyRecords[previousRecordIndex].deaths;
						let currentBasicValue, previousBasicValue;
						if (basicFact === BasicFactType.Cases)
						{
							currentBasicValue = currentCases;
							previousBasicValue = previousCases;
						}
						else if (basicFact === BasicFactType.Deaths)
						{
							currentBasicValue = currentDeaths;
							previousBasicValue = previousDeaths;
						}
						else
							throw "Invalid fact parameter";
						
						let currentMeasuredValue, previousMeasuredValue;
						if (measurement === MeasurementType.Absolute)
						{
							currentMeasuredValue = currentBasicValue;
							previousMeasuredValue = previousBasicValue;
						}
						else if (measurement === MeasurementType.CaseRelative && basicFact === BasicFactType.Deaths)
						{
							currentMeasuredValue = (currentBasicValue === 0) ? 0 : (currentBasicValue / currentCases);
							previousMeasuredValue = (previousBasicValue === 0) ? 0 : (previousBasicValue / previousCases);
						}
						else if (measurement === MeasurementType.PopulationRelative)
						{
							if (countyPopulation > 0)
							{
								currentMeasuredValue = currentBasicValue / countyPopulation * populationScale;
								previousMeasuredValue = previousBasicValue / countyPopulation * populationScale;
							}
							else
							{
								currentMeasuredValue = undefined;
								previousMeasuredValue = undefined;
							}
						}
						else
							throw "Invalid fact / measurement parameter combination";
						
						let displayFactValue;
						if (typeof currentMeasuredValue === "undefined")
							displayFactValue = undefined;
						else
						{
							if (dataView === DataViewType.DailyValue)
								displayFactValue = currentMeasuredValue;
							else if (dataView === DataViewType.ChangeAbsolute)
								displayFactValue = currentMeasuredValue - previousMeasuredValue;
							else if (dataView === DataViewType.ChangeProportional)
							{
								let valueChange = currentMeasuredValue - previousMeasuredValue;
								displayFactValue = (valueChange === 0) ? 0 : ((previousMeasuredValue === 0) ? Number.POSITIVE_INFINITY : valueChange / previousMeasuredValue);
							}
							else
								throw "Invalid data view parameter";
							
							if (displayFactValue > 0 && (animationData.minValueGreaterThanZero === null || displayFactValue < animationData.minValueGreaterThanZero))
								animationData.minValueGreaterThanZero = displayFactValue;
							if (displayFactValue > animationData.maxOverallDisplayFactValue && displayFactValue !== Number.POSITIVE_INFINITY)
								animationData.maxOverallDisplayFactValue = displayFactValue;
						}
						
						currentDailyRecord.displayFactValue = displayFactValue;
					}); // end forEach on county.covid19Records
			}); // end forEach on counties
		
		if (!colorationIsValid(coloration))
		{
			// No valid coloration was specified; auto-generate one.
			if (basicFact === BasicFactType.Deaths && measurement === MeasurementType.CaseRelative && dataView === DataViewType.ChangeProportional)
				animationData.coloration = buildColoration_Percentages(animationData.minValueGreaterThanZero, animationData.maxOverallDisplayFactValue);
			else
				animationData.coloration = buildColoration_Positive(animationData.minValueGreaterThanZero, animationData.maxOverallDisplayFactValue);
		}

		return animationData;
	} // end prepareDataForAnimation()


	let publicInterface =
		{
			FIPS_Length: FIPS_Length,

			BasicFactType: BasicFactType,
			MeasurementType: MeasurementType,
			DataViewType: DataViewType,
			AppWaitType: AppWaitType,

			DefaultFact: DefaultBasicFact,
			DefaultMeasurementType: DefaultMeasurementType,
			DefaultDataView: DefaultDataView,
			DefaultGrowthRangeDays: DefaultGrowthRangeDays,
			DefaultPopulationScale: DefaultPopulationScale,

			data:
			{
				load: loadData,
				//cullCounties: cullCounties,
				prepareDataForAnimation: prepareDataForAnimation,
				getCountyByID: getCountyByID,
				getDateFromDateNumber: getDateFromDateNumber,
				get firstReportedDate() { return allCountyData.firstDate; },
				get lastReportedDate() { return allCountyData.lastDate; }
			}
		};
	
	return publicInterface;
})(); // end appLogic singleton definition

export default appLogic;
