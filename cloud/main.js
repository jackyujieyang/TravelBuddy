var minMiles = 0.001; // set this to a minimum value to avoid worst senario
// we'll adjust this minMiles when we have better solution
// 5km so far is a bit too arbitrary

// If user's ACL hasn't been set yet, set ACL
Parse.Cloud.afterSave(Parse.User, function(request) {
	if(!request.object.get("ACL")) {
		var newACL = new Parse.ACL();
		newACL.setPublicReadAccess(true);
		newACL.setWriteAccess(request.object.id,true);
		request.object.setACL(newACL);
		request.object.save();
	}
});

Parse.Cloud.beforeSave("TravelPlan",function(request,response){
	var obj = request.object;
	var gl = obj.get("geoLocation");
	obj.unset("geoLocation", { silent: true });

	var newACL = new Parse.ACL();
	newACL.setPublicReadAccess(true);
	newACL.setWriteAccess(request.user,true);
	newACL.setPublicWriteAccess(false);
	obj.setACL(newACL);

	var query = new Parse.Query("MapMarker");
	query.withinMiles("geoLocation", gl, minMiles);
	query.limit(1);
	query.find({
		success:function(results){
			if(results.length){
				var mapMarker = results[0];
				obj.set("markerParent",mapMarker);
				obj.set("location",mapMarker.get('location')); // set plan location to mapMarker location
				response.success();
			}else{
				var MM = Parse.Object.extend("MapMarker");
				var mapMarker = new MM();
				mapMarker.set("geoLocation",gl);
				mapMarker.set("location",obj.get("location"));
				mapMarker.save(null, {
					success:function(savedMarker){
						obj.set("markerParent",savedMarker);
						response.success();
					},
					error:function(msg){
						response.error(msg);
					}
				});
			}
		},
		error:function(msg){
			response.error(msg);
		}
	});
});

Parse.Cloud.beforeSave("MapMarker",function(request,response){
	var newACL = new Parse.ACL();
	newACL.setPublicReadAccess(true);
	newACL.setPublicWriteAccess(false);
	request.object.setACL(newACL);
	response.success();
});