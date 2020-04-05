let appLogic = (function()
{
	const DataSource_Population = "/data/countyPopulations2018.csv";
	const DataSource_CaseData = "/data/countyCases.csv";

	const FIPS_Length = 5;

	const FactType =
	{
		Cases: 0,
		CasesPerCapita: 1,
		Deaths: 2,
		DeathsPerCapita: 3,
		DeathsPerCase: 4
	};
	
	const DataViewType =
	{
		CumulativeValue: 0,
		GrowthAbsolute: 1,
		GrowthLogarithmicBase: 2
	};

	const AppWaitType =
	{
		None: 0,
		LoadingMap: 1,
		LoadingPopulationData: 2,
		ProcessingPopulationData: 3,
		LoadingCaseData: 4,
		ProcessingCaseData: 5,
		BuildingVisualization: 6
	};
	
	const DefaultFact = FactType.Cases;
	const DefaultDataView = DataViewType.CumulativeValue;
	//const DefaultAnimationRatioMSPerDay = 1000;
	//const DefaultScaleMax = null;
	
	const allCountyData =
	{
		maxCaseCount: 0,
		maxDeaths: 0,
		firstDate: null,
		lastDate: null,
		counties: []
	};


	function parseDate(dateString)
	{
		let pieces = dateString.split("/"),
			parsedDate = new Date(pieces[2], parseInt(pieces[0], 10) - 1, pieces[1]);
		return parsedDate;
	} // end parseDate()


	function buildCountyList(csvText)
	{
		let parsedData =
			Papa.parse(
				csvText,
				{
					header: true,

					transformHeader:
						function(header)
						{
							if(header === "Id2")
								return "fips";
							else
								return "population";
						},

					transform:
						function(value, header)
						{
							if(header === "fips")
								return value.padStart(FIPS_Length, "0");
							else
								return value;
						},
					
					dynamicTyping: header => (header === "population"),

					skipEmptyLines: true
				}).data;
		
		allCountyData.maxCaseCount = 0;
		allCountyData.maxDeaths = 0;
		allCountyData.firstDate = null;
		allCountyData.lastDate = null;
		allCountyData.counties = [];
		parsedData.forEach(
			item =>
			{
				allCountyData.counties[parseInt(item.fips, 10)] =
					{
						id: item.fips,
						population: item.population,
						maxCaseCount: 0,
						maxDeaths: 0,
						covid19Records: []
					};
			});
	} // end buildCountyList()


	function storeCountyCaseData(csvText)
	{
		let parsedData = Papa.parse(
			csvText,
			{
				header: true,

				transformHeader: header => ((header === "fips") ? "id" : header),

				transform:
					(value, header) => ((header === "id") ? value.padStart(FIPS_Length, "0") : value),

				dynamicTyping: header => (header === "cases" || header === "deaths"),

				skipEmptyLines: true
			}).data;
		
		parsedData.forEach(
			item =>
			{
				if (item.id !== "00000")
				{
					let intId = parseInt(item.id, 10);
					let currentCounty = allCountyData.counties[intId];

					if (typeof currentCounty === "undefined")
						throw "Error: No such county as " + item.id;
					
					let cases = item.cases, deaths = item.deaths, date = parseDate(item.date);

					if (cases > allCountyData.maxCaseCount)
						allCountyData.maxCaseCount = cases;
					if (deaths > allCountyData.maxDeaths)
						allCountyData.maxDeaths = deaths;
					if (allCountyData.firstDate === null || date < allCountyData.firstDate)
						allCountyData.firstDate = date;
					if (allCountyData.lastDate === null || date > allCountyData.lastDate)
						allCountyData.lastDate = date;
					
					if (cases > currentCounty.maxCaseCount)
						currentCounty.maxCaseCount = cases;
					if (deaths > currentCounty.maxDeaths)
						currentCounty.maxDeaths = deaths;
					currentCounty.covid19Records.push(
						{
							date: date,
							cumulativeCases: item.cases,
							cumulativeDeaths: item.deaths
						});
					}
			});
	} // end storeCountyCaseData()


	function loadData(statusUpdateFunction, completionCallback)
	{
		statusUpdateFunction(AppWaitType.LoadingPopulationData);
		fetch(DataSource_Population)
			.then(
				response =>
				{
					statusUpdateFunction(AppWaitType.ProcessingPopulationData);
					return response.text();
				})
			.then(
				text =>
				{
					buildCountyList(text);
					statusUpdateFunction(AppWaitType.LoadingCaseData);
					return fetch(DataSource_CaseData);
				})
			.then(
				response =>
				{
					statusUpdateFunction(AppWaitType.ProcessingCaseData);
					return response.text();
				})
			.then(
				text =>
				{
					storeCountyCaseData(text);
					completionCallback();
				});
	} // end loadData()


	let publicInterface =
		{
			FactType: FactType,
			DataViewType: DataViewType,
			DefaultFact: DefaultFact,
			DefaultDataView: DefaultDataView,
			AppWaitType: AppWaitType,

			allCountyData: allCountyData,
			loadData: loadData
		};
	
	return publicInterface;
})(); // end appLogic singleton definition

export default appLogic;
