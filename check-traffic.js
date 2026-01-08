// Simple script to check for ACTUAL_TRAFFIC edges
// Run with: node check-traffic.js

const API_URL = 'https://saferemediate-frontend.vercel.app/api/proxy/dependency-map/full?systemName=alon-prod';

console.log('🔍 Checking for ACTUAL_TRAFFIC edges...\n');
console.log('Fetching from:', API_URL);

fetch(API_URL)
  .then(r => r.json())
  .then(d => {
    console.log('\n✅ API Response:');
    console.log('   Total nodes:', d.nodes?.length || 0);
    console.log('   Total edges:', d.edges?.length || 0);
    
    const trafficEdges = (d.edges || []).filter(e => 
      e.edge_type === 'ACTUAL_TRAFFIC' || 
      e.type === 'ACTUAL_TRAFFIC' ||
      e.relationship_type === 'ACTUAL_TRAFFIC'
    );
    
    console.log('\n🎯 ACTUAL_TRAFFIC Edges:');
    console.log('   Found:', trafficEdges.length);
    
    if (trafficEdges.length > 0) {
      console.log('\n📋 Sample edges:');
      trafficEdges.slice(0, 3).forEach((edge, i) => {
        console.log(`\n   Edge ${i + 1}:`);
        console.log('     Source:', edge.source);
        console.log('     Target:', edge.target);
        console.log('     Type field:', edge.type || 'N/A');
        console.log('     Edge_type field:', edge.edge_type || 'N/A');
        console.log('     Port:', edge.port || 'N/A');
        console.log('     Protocol:', edge.protocol || 'N/A');
      });
      
      // Check which field is used
      const usingType = trafficEdges.filter(e => e.type === 'ACTUAL_TRAFFIC').length;
      const usingEdgeType = trafficEdges.filter(e => e.edge_type === 'ACTUAL_TRAFFIC').length;
      
      console.log('\n📊 Field Usage:');
      console.log('   Using "type":', usingType);
      console.log('   Using "edge_type":', usingEdgeType);
    } else {
      console.log('\n⚠️  No ACTUAL_TRAFFIC edges found!');
      console.log('\n📋 All edge types in response:');
      const edgeTypes = {};
      (d.edges || []).forEach(e => {
        const type = e.type || e.edge_type || e.relationship_type || 'unknown';
        edgeTypes[type] = (edgeTypes[type] || 0) + 1;
      });
      Object.entries(edgeTypes).forEach(([type, count]) => {
        console.log(`   ${type}: ${count}`);
      });
    }
  })
  .catch(error => {
    console.error('\n❌ Error:', error.message);
  });

